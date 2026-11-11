import { create } from 'zustand';
import { CanvasTexture, SRGBColorSpace, LinearFilter, VideoTexture, type Texture } from 'three';
import { audioEngine } from '../audio/AudioEngine';

export interface TrailerSource {
  id: string;
  title: string;
  accent: string;
  url?: string;
}

interface TrailerState {
  playing: boolean;
  muted: boolean;
  volume: number;
  spatial: boolean;
  source: 'none' | 'video' | 'synthetic';
  /** Width / height of the content shown on screen. */
  aspect: number;
  /** True while the browser blocks audio/video until the user interacts. */
  needsGesture: boolean;
  /** Bumped whenever the texture object changes. */
  version: number;
  note: string;
}

export const useTrailer = create<TrailerState>(() => ({
  playing: false,
  muted: false,
  volume: 0.8,
  spatial: true,
  source: 'none',
  aspect: 2.39,
  needsGesture: false,
  version: 0,
  note: '',
}));
const set = useTrailer.setState;

const W = 1280;
const H = 536; // 2.39:1

/**
 * Owns trailer playback, independent of the camera and of React renders.
 * Seat changes never touch this object, so playback is not interrupted.
 */
class TrailerController {
  texture: Texture | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private loadedId: string | null = null;
  private objectUrl: string | null = null;
  private meta: TrailerSource | null = null;
  private synthTime = 0;
  private sinceDraw = 1;
  private audioRouted = false;

  /** Prepare audio + media for a movie and start playing. */
  enter(meta: TrailerSource, screen: { width: number; centerY: number }): void {
    const ok = audioEngine.init(screen);
    audioEngine.onState = () => this.syncGesture();
    const s = useTrailer.getState();
    audioEngine.setVolume(s.volume);
    audioEngine.setMuted(s.muted);
    audioEngine.setSpatial(s.spatial);
    if (!ok) set({ note: 'Web Audio is unavailable; using plain playback.' });
    if (this.loadedId !== meta.id) this.load(meta);
    void this.play();
  }

  leave(): void {
    this.pause();
    audioEngine.suspend();
  }

  async play(): Promise<void> {
    audioEngine.resume();
    if (this.video) {
      try {
        await this.video.play();
      } catch {
        set({ needsGesture: true, playing: false });
        return;
      }
    } else {
      audioEngine.setSynthActive(true);
    }
    set({ playing: true });
    setTimeout(() => this.syncGesture(), 300);
  }

  pause(): void {
    this.video?.pause();
    audioEngine.setSynthActive(false);
    set({ playing: false });
  }

  toggle(): void {
    if (useTrailer.getState().playing) this.pause();
    else void this.play();
  }

  setVolume(v: number): void {
    set({ volume: v, muted: v === 0 });
    audioEngine.setVolume(v);
    audioEngine.setMuted(v === 0);
    this.applyDirectVolume();
  }

  setMuted(m: boolean): void {
    set({ muted: m });
    audioEngine.setMuted(m);
    this.applyDirectVolume();
  }

  setSpatial(on: boolean): void {
    set({ spatial: on });
    audioEngine.setSpatial(on);
  }

  /** Use a video the user chose from disk (never uploaded anywhere). */
  loadFile(file: File, meta: TrailerSource): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.load({ ...meta, url: this.objectUrl });
    void this.play();
  }

  /** Called every frame from the 3D scene. */
  tick(dt: number): void {
    if (this.video || !this.g || !this.meta) return;
    if (useTrailer.getState().playing) this.synthTime += dt;
    this.sinceDraw += dt;
    if (this.sinceDraw < 1 / 30) return;
    this.sinceDraw = 0;
    this.drawSynthetic();
    if (this.texture) this.texture.needsUpdate = true;
  }

  private syncGesture(): void {
    const blocked = audioEngine.state === 'suspended' && useTrailer.getState().playing;
    if (blocked !== useTrailer.getState().needsGesture) set({ needsGesture: blocked });
  }

  private applyDirectVolume(): void {
    // Only needed when the element is not routed through Web Audio.
    if (this.video && !this.audioRouted) {
      const s = useTrailer.getState();
      this.video.volume = s.muted ? 0 : s.volume;
    }
  }

  private disposeCurrent(): void {
    this.video?.pause();
    this.video?.removeAttribute('src');
    this.video?.load();
    audioEngine.detachMedia();
    this.texture?.dispose();
    this.video = null;
    this.texture = null;
    this.audioRouted = false;
  }

  private load(meta: TrailerSource): void {
    this.disposeCurrent();
    this.meta = meta;
    this.loadedId = meta.id;
    this.synthTime = 0;
    if (meta.url) this.loadVideo(meta.url);
    else this.useSynthetic('No trailer file configured. Showing a placeholder.');
  }

  private loadVideo(url: string): void {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.addEventListener('loadedmetadata', () => {
      if (v.videoWidth) set({ aspect: v.videoWidth / v.videoHeight });
    });
    v.addEventListener(
      'error',
      () => {
        if (this.video === v) this.useSynthetic('Trailer file could not be loaded. Showing a placeholder.');
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
    set({ source: 'video', note: '', version: useTrailer.getState().version + 1 });
  }

  private useSynthetic(note: string): void {
    const wasVideo = !!this.video;
    if (wasVideo) this.disposeCurrent();
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = W;
      this.canvas.height = H;
      this.g = this.canvas.getContext('2d');
    }
    const tex = new CanvasTexture(this.canvas);
    tex.colorSpace = SRGBColorSpace;
    this.texture = tex;
    set({ source: 'synthetic', aspect: W / H, note, version: useTrailer.getState().version + 1 });
    if (wasVideo && useTrailer.getState().playing) audioEngine.setSynthActive(true);
  }

  private drawSynthetic(): void {
    const g = this.g!;
    const m = this.meta!;
    g.fillStyle = '#08090d';
    g.fillRect(0, 0, W, H);
    g.fillStyle = m.accent;
    g.globalAlpha = 0.35;
    g.fillRect(0, H / 2 - 150, W, 1);
    g.fillRect(0, H / 2 + 150, W, 1);
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.fillStyle = '#f1efe8';
    g.font = '600 96px Georgia, serif';
    g.fillText(m.title, W / 2, H / 2 + 20);
    g.fillStyle = '#9a9aa4';
    g.font = '500 22px system-ui, sans-serif';
    g.fillText('TRAILER PLACEHOLDER', W / 2, H / 2 - 100);
    g.font = '18px system-ui, sans-serif';
    g.fillText(`Add public/trailers/${m.id}.mp4 or load a local file`, W / 2, H / 2 + 80);

    // Audio-synced sweep: the on-screen bar and the HRTF noise travel together.
    const p = audioEngine.effectProgress();
    if (p >= 0) {
      const x = (p * 1.2 - 0.1) * W;
      g.fillStyle = m.accent;
      g.globalAlpha = 0.9;
      g.fillRect(x - 2, H / 2 - 140, 4, 280);
      g.globalAlpha = 1;
    }
    const t = Math.floor(this.synthTime);
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    g.textAlign = 'left';
    g.fillStyle = '#6b6b75';
    g.font = '16px ui-monospace, monospace';
    g.fillText(`${mm}:${ss}`, 24, H - 22);
  }
}

export const trailer = new TrailerController();

