import type { Vec3 } from '../../domain/types';

/**
 * Headphone spatial-audio SIMULATION built on the Web Audio API.
 *
 * Two virtual speakers (left/right of the screen) are rendered through HRTF
 * PannerNodes. The AudioListener follows the first-person camera, so moving
 * seats changes direction, distance filtering and reverb. This is NOT Dolby
 * Atmos or any decoded object-based format. A future decoder could feed
 * `programIn` without changing the rest of the graph.
 */
export const EFFECT_PERIOD = 7;
export const EFFECT_LEN = 3;

type AnyAudioContext = typeof AudioContext;

export class AudioEngine {
  ctx: AudioContext | null = null;
  onState: ((s: AudioContextState) => void) | null = null;

  private master!: GainNode;
  private programIn!: GainNode;
  private spatialSum!: GainNode;
  private stereoGain!: GainNode;
  private lowpass!: BiquadFilterNode;
  private reverbWet!: GainNode;
  private pL!: PannerNode;
  private pR!: PannerNode;
  private noise!: AudioBuffer;
  private ambientGain!: GainNode;

  private volume = 0.8;
  private muted = false;
  private spatial = true;
  private screen = { width: 11, centerY: 3.9 };

  private mediaSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private currentMedia: MediaElementAudioSourceNode | null = null;
  private synthGain: GainNode | null = null;
  private synthNodes: AudioScheduledSourceNode[] = [];
  private effectTimer: number | null = null;
  private effectStart = -1;

  /** Creates the graph (idempotent). Returns false if Web Audio is unavailable. */
  init(screen: { width: number; centerY: number }): boolean {
    this.screen = screen;
    if (this.ctx) {
      this.positionSpeakers();
      return true;
    }
    const Ctor: AnyAudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AnyAudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    const ctx = (this.ctx = new Ctor({ latencyHint: 'interactive' }));
    ctx.onstatechange = () => this.onState?.(ctx.state);

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    // Everything audible enters here. Forcing 2 channels upmixes mono sources.
    this.programIn = ctx.createGain();
    this.programIn.channelCount = 2;
    this.programIn.channelCountMode = 'explicit';
    this.programIn.channelInterpretation = 'speakers';

    // Plain stereo path (fallback / spatial off).
    this.stereoGain = ctx.createGain();
    this.stereoGain.gain.value = this.spatial ? 0 : 1;
    this.programIn.connect(this.stereoGain);
    this.stereoGain.connect(this.master);

    // Spatial path: L and R channels become two HRTF-positioned virtual speakers.
    const split = ctx.createChannelSplitter(2);
    this.programIn.connect(split);
    this.pL = this.makePanner();
    this.pR = this.makePanner();
    split.connect(this.pL, 0);
    split.connect(this.pR, 1);
    this.spatialSum = ctx.createGain();
    this.spatialSum.gain.value = this.spatial ? 1 : 0;
    this.pL.connect(this.spatialSum);
    this.pR.connect(this.spatialSum);

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 18000;
    this.spatialSum.connect(this.lowpass);
    this.lowpass.connect(this.master);

    // Room reverb (generated impulse response, no asset download).
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(1.8);
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0.15;
    this.spatialSum.connect(convolver);
    convolver.connect(this.reverbWet);
    this.reverbWet.connect(this.master);

    this.noise = this.makeNoise();
    this.startAmbient();
    this.positionSpeakers();
    return true;
  }

  get state(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none';
  }

  resume(): void {
    void this.ctx?.resume();
  }
  suspend(): void {
    void this.ctx?.suspend();
  }

  setVolume(v: number): void {
    this.volume = v;
    this.applyMaster();
  }
  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMaster();
  }
  setSpatial(on: boolean): void {
    this.spatial = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.spatialSum.gain.setTargetAtTime(on ? 1 : 0, t, 0.05);
    this.stereoGain.gain.setTargetAtTime(on ? 0 : 1, t, 0.05);
  }

  /** Routes a media element through the graph. Each element can only be wrapped once. */
  attachMedia(el: HTMLMediaElement): boolean {
    if (!this.ctx) return false;
    this.currentMedia?.disconnect();
    let src = this.mediaSources.get(el);
    if (!src) {
      src = this.ctx.createMediaElementSource(el);
      this.mediaSources.set(el, src);
    }
    src.connect(this.programIn);
    this.currentMedia = src;
    return true;
  }
  detachMedia(): void {
    this.currentMedia?.disconnect();
    this.currentMedia = null;
  }

  /** Follows the first-person camera. Called every frame. */
  setListener(pos: Vec3, fwd: Vec3): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos[0];
      l.positionY.value = pos[1];
      l.positionZ.value = pos[2];
      l.forwardX.value = fwd[0];
      l.forwardY.value = fwd[1];
      l.forwardZ.value = fwd[2];
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(pos[0], pos[1], pos[2]);
      l.setOrientation(fwd[0], fwd[1], fwd[2], 0, 1, 0);
    }
    // Farther seats: slightly duller, more reverberant.
    const dist = Math.hypot(pos[0], pos[1] - this.screen.centerY, pos[2]);
    this.lowpass.frequency.value = Math.max(7000, 18000 - dist * 350);
    this.reverbWet.gain.value = Math.min(0.45, 0.06 + dist * 0.012);
  }

  // ---- Synthetic program (used when no trailer file is available) ----

  setSynthActive(active: boolean): void {
    if (!this.ctx) return;
    if (active) {
      this.ensureSynth();
      this.synthGain!.gain.setTargetAtTime(1, this.ctx.currentTime, 0.2);
      if (this.effectTimer === null) {
        window.setTimeout(() => this.scheduleEffect(), 1200);
        this.effectTimer = window.setInterval(() => this.scheduleEffect(), EFFECT_PERIOD * 1000);
      }
    } else {
      this.synthGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      if (this.effectTimer !== null) {
        clearInterval(this.effectTimer);
        this.effectTimer = null;
      }
    }
  }

  /** 0..1 progress of the current panned effect, or -1 when none is playing. */
  effectProgress(): number {
    if (!this.ctx || this.effectStart < 0) return -1;
    const p = (this.ctx.currentTime - this.effectStart) / EFFECT_LEN;
    return p >= 0 && p <= 1 ? p : -1;
  }

  // ---- internals ----

  private applyMaster() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }

  private makePanner(): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 6;
    p.maxDistance = 100;
    p.rolloffFactor = 0.6;
    return p;
  }

  private setPos(p: PannerNode, x: number, y: number, z: number) {
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else p.setPosition(x, y, z);
  }

  private positionSpeakers() {
    if (!this.pL) return;
    const x = this.screen.width * 0.33;
    this.setPos(this.pL, -x, this.screen.centerY, -0.3);
    this.setPos(this.pR, x, this.screen.centerY, -0.3);
  }

  private makeImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /** Low ventilation rumble of an auditorium. */
  private startAmbient() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.18;
    src.connect(lp);
    lp.connect(this.ambientGain);
    this.ambientGain.connect(this.master);
    src.start();
  }

  private ensureSynth() {
    const ctx = this.ctx!;
    if (this.synthGain) return;
    const merger = ctx.createChannelMerger(2);
    this.synthGain = ctx.createGain();
    this.synthGain.gain.value = 0;
    merger.connect(this.synthGain);
    this.synthGain.connect(this.programIn);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfo.start();
    this.synthNodes.push(lfo);

    const voice = (freqs: number[], channel: 0 | 1) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      lfoGain.connect(lp.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.035;
      lp.connect(g);
      g.connect(merger, 0, channel);
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = (i - 1) * 7;
        o.connect(lp);
        o.start();
        this.synthNodes.push(o);
      });
    };
    voice([110, 164.81, 220], 0);
    voice([130.81, 196, 261.63], 1);
  }

  /** A band-passed noise sweep that travels across the screen, left to right. */
  private scheduleEffect() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + 0.05;
    const t1 = t0 + EFFECT_LEN;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(2400, t1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.5, t0 + EFFECT_LEN * 0.4);
    g.gain.linearRampToValueAtTime(0, t1);
    src.connect(bp);
    bp.connect(g);

    const w = this.screen.width;
    const hp = this.makePanner();
    if (hp.positionX) {
      hp.positionX.setValueAtTime(-w * 0.6, t0);
      hp.positionX.linearRampToValueAtTime(w * 0.6, t1);
      hp.positionY.value = this.screen.centerY;
      hp.positionZ.value = -0.3;
    } else this.setPos(hp, 0, this.screen.centerY, -0.3);
    g.connect(hp);
    hp.connect(this.spatialSum);

    const sp = ctx.createStereoPanner();
    sp.pan.setValueAtTime(-1, t0);
    sp.pan.linearRampToValueAtTime(1, t1);
    g.connect(sp);
    sp.connect(this.stereoGain);

    src.start(t0);
    src.stop(t1 + 0.1);
    this.effectStart = t0;
  }
}

export const audioEngine = new AudioEngine();

