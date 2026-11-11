import { create } from 'zustand';
import { SRGBColorSpace, LinearFilter, VideoTexture, type Texture } from 'three';
import { audioEngine } from '../audio/AudioEngine';
import type { TrailerMetadata } from '../../domain/types';

export interface TrailerSource {
  id: string;
  title: string;
  originalTitle?: string;
  accent: string;
  /** Optional licensed direct CORS-enabled video stream (.mp4 / .webm). */
  url?: string;
  /** Official trailer metadata retrieved from TMDB / discovery service. */
  trailerMeta?: TrailerMetadata | null;
}

export type TrailerPlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error'
  | 'unavailable';

interface TrailerState {
  status: TrailerPlaybackStatus;
  playing: boolean;
  loading: boolean;
  muted: boolean;
  volume: number;
  /**
   * For direct HTML5 video: routes stereo channels through Web Audio HRTF speakers.
   * For YouTube IFrame trailers: enables spatialized Web Audio auditorium room ambience
   * while YouTube plays its native synchronized stereo audio.
   */
  spatial: boolean;
  source: 'none' | 'youtube' | 'video' | 'unavailable';
  videoId: string | null;
  trailerTitle: string;
  trailerLanguage: string;
  /** Width / height of the content shown on screen. */
  aspect: number;
  /** True while the browser blocks unmuted audio until the user interacts. */
  needsGesture: boolean;
  /** Bumped whenever the WebGL VideoTexture object changes. */
  version: number;
  error: string | null;
}

export const useTrailer = create<TrailerState>(() => ({
  status: 'idle',
  playing: false,
  loading: false,
  muted: false,
  volume: 0.85,
  spatial: true,
  source: 'none',
  videoId: null,
  trailerTitle: '',
  trailerLanguage: '',
  aspect: 16 / 9,
  needsGesture: false,
  version: 0,
  error: null,
}));
const set = useTrailer.setState;

// Minimal typings for the official YouTube IFrame Player API
interface YTPlayerInstance {
  playVideo?: () => void;
  pauseVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  mute?: () => void;
  unMute?: () => void;
  isMuted?: () => boolean;
  setVolume?: (volume: number) => void;
  getPlayerState?: () => number;
  loadVideoById?: (videoId: string) => void;
  destroy?: () => void;
}

interface YTGlobal {
  Player: new (
    elementIdOrEl: string | HTMLElement,
    options: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (ev: { target: YTPlayerInstance }) => void;
        onStateChange?: (ev: { data: number; target: YTPlayerInstance }) => void;
        onError?: (ev: { data: number }) => void;
      };
    },
  ) => YTPlayerInstance;
  PlayerState?: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTGlobal> | null = null;

function loadYouTubeIframeApi(): Promise<YTGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No window environment'));
  }
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<YTGlobal>((resolve, reject) => {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      if (window.YT && window.YT.Player) {
        resolve(window.YT);
      }
    };

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        ytApiPromise = null;
        reject(new Error('Failed to load YouTube IFrame Player API'));
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

/**
 * Owns trailer playback on the virtual 3D cinema screen, independent of camera movement.
 * Supports:
 * 1. Official YouTube trailers rendered directly onto the 3D screen plane via YT.Player API.
 * 2. Licensed direct HTML5 video streams rendered as a Three.js VideoTexture on the 3D screen mesh.
 * Never substitutes static movie posters or synthetic fake video placeholders.
 */
class TrailerController {
  texture: Texture | null = null;
  stageEl: HTMLDivElement | null = null;
  cameraEl: HTMLDivElement | null = null;
  screenEl: HTMLDivElement | null = null;

  private video: HTMLVideoElement | null = null;
  private ytPlayer: YTPlayerInstance | null = null;
  private ytReady = false;
  private ytContainerEl: HTMLElement | null = null;
  private loadedKey: string | null = null;
  private meta: TrailerSource | null = null;
  private audioRouted = false;

  setScreenPlaneElements(
    stageEl: HTMLDivElement | null,
    cameraEl: HTMLDivElement | null,
    screenEl: HTMLDivElement | null,
  ): void {
    this.stageEl = stageEl;
    this.cameraEl = cameraEl;
    this.screenEl = screenEl;
  }

  /** Prepare audio + media for the selected movie and start playing on the auditorium screen. */
  enter(meta: TrailerSource, screen: { width: number; centerY: number }): void {
    audioEngine.init(screen);
    audioEngine.onState = () => this.syncGesture();
    const s = useTrailer.getState();
    audioEngine.setVolume(s.volume);
    audioEngine.setMuted(s.muted);
    audioEngine.setSpatial(s.spatial);
    // Disable any synthetic test oscillator so only real trailer audio + subtle room ambience play
    audioEngine.setSynthActive(false);

    const cacheKey = `${meta.id}|${meta.trailerMeta?.videoId ?? ''}|${meta.url ?? ''}`;
    if (this.loadedKey !== cacheKey) {
      this.load(meta, cacheKey);
    } else {
      void this.play();
    }
  }

  leave(): void {
    this.pause();
    this.disposeCurrent();
    this.loadedKey = null;
    audioEngine.suspend();
    set({
      status: 'idle',
      playing: false,
      loading: false,
      source: 'none',
      videoId: null,
      error: null,
    });
  }

  /** Mounts the YouTube IFrame API player inside the 3D screen plane DOM node. */
  attachYouTubeContainer(el: HTMLElement | null): void {
    this.ytContainerEl = el;
    const s = useTrailer.getState();
    if (el && s.source === 'youtube' && s.videoId) {
      void this.initYouTubePlayer(s.videoId);
    }
  }

  async play(): Promise<void> {
    audioEngine.resume();
    const s = useTrailer.getState();

    if (s.source === 'video' && this.video) {
      try {
        await this.video.play();
        set({ playing: true, status: 'playing', loading: false, needsGesture: false, error: null });
      } catch {
        set({ needsGesture: true, playing: false, status: 'paused' });
      }
      return;
    }

    if (s.source === 'youtube' && this.ytPlayer && this.ytReady) {
      try {
        if (!s.muted) {
          this.ytPlayer.unMute?.();
          this.ytPlayer.setVolume?.(Math.round(s.volume * 100));
        }
        this.ytPlayer.playVideo?.();
        set({ playing: true, status: 'playing', needsGesture: false });
      } catch {
        set({ needsGesture: true });
      }
    }
  }

  pause(): void {
    const s = useTrailer.getState();
    if (s.source === 'video' && this.video) {
      this.video.pause();
    }
    if (s.source === 'youtube' && this.ytPlayer && this.ytReady) {
      try {
        this.ytPlayer.pauseVideo?.();
      } catch {
        // Ignore if player already disposed
      }
    }
    set({ playing: false, status: s.status === 'unavailable' || s.status === 'error' ? s.status : 'paused' });
  }

  toggle(): void {
    if (useTrailer.getState().playing) this.pause();
    else void this.play();
  }

  replay(): void {
    audioEngine.resume();
    const s = useTrailer.getState();
    if (s.source === 'video' && this.video) {
      this.video.currentTime = 0;
      void this.play();
      return;
    }
    if (s.source === 'youtube' && this.ytPlayer && this.ytReady) {
      try {
        this.ytPlayer.seekTo?.(0, true);
        this.ytPlayer.playVideo?.();
        set({ playing: true, status: 'playing', error: null });
      } catch {
        // Ignore
      }
    }
  }

  retry(): void {
    if (!this.meta) return;
    const currentMeta = this.meta;
    this.loadedKey = null;
    this.load(currentMeta, `${currentMeta.id}|${currentMeta.trailerMeta?.videoId ?? ''}|retry-${Date.now()}`);
  }

  setVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    const isZero = clamped === 0;
    set({ volume: clamped, muted: isZero });
    audioEngine.setVolume(clamped);
    audioEngine.setMuted(isZero);
    this.applyDirectVolume();
    if (this.ytPlayer && this.ytReady) {
      try {
        if (isZero) {
          this.ytPlayer.mute?.();
        } else {
          this.ytPlayer.unMute?.();
          this.ytPlayer.setVolume?.(Math.round(clamped * 100));
        }
      } catch {
        // Ignore
      }
    }
  }

  setMuted(m: boolean): void {
    set({ muted: m });
    audioEngine.setMuted(m);
    this.applyDirectVolume();
    if (this.ytPlayer && this.ytReady) {
      try {
        if (m) {
          this.ytPlayer.mute?.();
        } else {
          audioEngine.resume();
          this.ytPlayer.unMute?.();
          this.ytPlayer.setVolume?.(Math.round(useTrailer.getState().volume * 100));
        }
      } catch {
        // Ignore
      }
    }
  }

  setSpatial(on: boolean): void {
    set({ spatial: on });
    audioEngine.setSpatial(on);
  }

  private syncGesture(): void {
    const s = useTrailer.getState();
    if (s.source === 'video') {
      const blocked = audioEngine.state === 'suspended' && s.playing;
      if (blocked !== s.needsGesture) set({ needsGesture: blocked });
    }
  }

  private applyDirectVolume(): void {
    if (this.video && !this.audioRouted) {
      const s = useTrailer.getState();
      this.video.volume = s.muted ? 0 : s.volume;
    }
  }

  private disposeCurrent(): void {
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    audioEngine.detachMedia();
    this.texture?.dispose();
    this.video = null;
    this.texture = null;
    this.audioRouted = false;

    if (this.ytPlayer) {
      try {
        this.ytPlayer.destroy?.();
      } catch {
        // Ignore
      }
      this.ytPlayer = null;
      this.ytReady = false;
    }
  }

  private load(meta: TrailerSource, cacheKey: string): void {
    this.disposeCurrent();
    this.meta = meta;
    this.loadedKey = cacheKey;

    const directUrl = meta.trailerMeta?.directVideoUrl || (meta.url && meta.url.startsWith('http') ? meta.url : '');
    if (directUrl) {
      this.loadDirectVideo(directUrl, meta);
      return;
    }

    if (meta.trailerMeta && meta.trailerMeta.videoId) {
      set({
        source: 'youtube',
        status: 'loading',
        loading: true,
        playing: false,
        videoId: meta.trailerMeta.videoId,
        trailerTitle: meta.trailerMeta.title || `${meta.title} — Official Trailer`,
        trailerLanguage: meta.trailerMeta.language || '',
        aspect: 16 / 9,
        error: null,
        version: useTrailer.getState().version + 1,
      });
      if (this.ytContainerEl) {
        void this.initYouTubePlayer(meta.trailerMeta.videoId);
      }
      return;
    }

    set({
      source: 'unavailable',
      status: 'unavailable',
      loading: false,
      playing: false,
      videoId: null,
      trailerTitle: meta.title,
      trailerLanguage: '',
      error: 'No official embeddable trailer was found for this movie release.',
      version: useTrailer.getState().version + 1,
    });
  }

  private async initYouTubePlayer(videoId: string): Promise<void> {
    if (!this.ytContainerEl) return;

    if (this.ytPlayer && this.ytReady) {
      try {
        set({ status: 'loading', loading: true, error: null });
        this.ytPlayer.loadVideoById?.(videoId);
        return;
      } catch {
        this.disposeCurrent();
      }
    }

    try {
      const YT = await loadYouTubeIframeApi();
      if (!this.ytContainerEl || useTrailer.getState().videoId !== videoId) return;

      this.ytContainerEl.innerHTML = '';
      const mountNode = document.createElement('div');
      this.ytContainerEl.appendChild(mountNode);

      this.ytReady = false;
      this.ytPlayer = new YT.Player(mountNode, {
        width: '100%',
        height: '100%',
        videoId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (ev) => {
            this.ytReady = true;
            const s = useTrailer.getState();
            try {
              ev.target.setVolume?.(Math.round(s.volume * 100));
              if (s.muted) {
                ev.target.mute?.();
              } else {
                ev.target.unMute?.();
              }
              ev.target.playVideo?.();
            } catch {
              // Autoplay with sound may require gesture in some browsers
            }

            // Check after 600ms if browser blocked unmuted autoplay; if so, start playing muted & prompt user to unmute
            window.setTimeout(() => {
              if (!this.ytPlayer || !this.ytReady) return;
              const state = this.ytPlayer.getPlayerState?.();
              if (state !== 1 && state !== 3) {
                try {
                  this.ytPlayer.mute?.();
                  this.ytPlayer.playVideo?.();
                  set({ muted: true, needsGesture: true });
                } catch {
                  set({ needsGesture: true });
                }
              }
            }, 650);
          },
          onStateChange: (ev) => {
            const state = ev.data;
            if (state === 1) {
              // PLAYING
              const isMutedNow = Boolean(ev.target.isMuted?.());
              set({
                status: 'playing',
                playing: true,
                loading: false,
                muted: isMutedNow,
                error: null,
              });
            } else if (state === 2) {
              // PAUSED
              set({
                status: 'paused',
                playing: false,
                loading: false,
              });
            } else if (state === 3) {
              // BUFFERING
              set({
                status: 'loading',
                loading: true,
              });
            } else if (state === 0) {
              // ENDED
              set({
                status: 'ended',
                playing: false,
                loading: false,
              });
            }
          },
          onError: (ev) => {
            const code = ev.data;
            const msg =
              code === 101 || code === 150
                ? 'The movie distributor has restricted embedded playback for this trailer.'
                : 'Trailer video stream could not be loaded (Error ' + code + ').';
            set({
              status: 'error',
              playing: false,
              loading: false,
              error: msg,
            });
          },
        },
      });
    } catch (err) {
      set({
        status: 'error',
        playing: false,
        loading: false,
        error: err instanceof Error ? err.message : 'Unable to initialize cinema screen trailer player.',
      });
    }
  }

  private loadDirectVideo(url: string, meta: TrailerSource): void {
    set({
      source: 'video',
      status: 'loading',
      loading: true,
      playing: false,
      videoId: null,
      trailerTitle: meta.trailerMeta?.title || `${meta.title} — Official Trailer`,
      trailerLanguage: meta.trailerMeta?.language || '',
      error: null,
    });

    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.loop = false;
    v.playsInline = true;
    v.preload = 'auto';

    v.addEventListener('loadedmetadata', () => {
      if (v.videoWidth && v.videoHeight) {
        set({ aspect: v.videoWidth / v.videoHeight, loading: false });
      }
    });
    v.addEventListener('playing', () => {
      set({ status: 'playing', playing: true, loading: false, error: null });
    });
    v.addEventListener('pause', () => {
      if (!v.ended) set({ status: 'paused', playing: false });
    });
    v.addEventListener('ended', () => {
      set({ status: 'ended', playing: false, loading: false });
    });
    v.addEventListener(
      'error',
      () => {
        if (this.video !== v) return;
        // If direct video fails and we have a YouTube trailer, switch to YouTube trailer on screen
        if (meta.trailerMeta?.videoId) {
          this.disposeCurrent();
          set({
            source: 'youtube',
            status: 'loading',
            loading: true,
            videoId: meta.trailerMeta.videoId,
            error: null,
          });
          if (this.ytContainerEl) {
            void this.initYouTubePlayer(meta.trailerMeta.videoId);
          }
        } else {
          set({
            status: 'error',
            playing: false,
            loading: false,
            error: 'Direct video stream could not be loaded.',
          });
        }
      },
      { once: true },
    );

    v.src = url;
    this.video = v;
    this.audioRouted = audioEngine.attachMedia(v);
    this.applyDirectVolume();

    const tex = new VideoTexture(v);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    this.texture = tex;
    set({ version: useTrailer.getState().version + 1 });
    void this.play();
  }
}

export const trailer = new TrailerController();
