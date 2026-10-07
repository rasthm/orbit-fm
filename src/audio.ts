import type Hls from 'hls.js';
import { proxiedStreamUrl, resolveStream, type Station } from './api';

export type PlayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

type Attempt = { src: string; cors: boolean };

const ATTEMPT_TIMEOUT_MS = 9000;
// 0.1s of silence, used to unlock both audio elements inside the first user gesture.
const SILENCE =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

// iOS suspends Web Audio when the screen locks, which would mute a routed stream,
// so on iOS we never route through the analyser (the visualizer falls back to simulation).
const IS_IOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

class AudioEngine {
  /** Routed through an AnalyserNode, so only usable for CORS-enabled sources. */
  private corsEl = this.makeElement(true);
  /** Plays anything, but its output can't be analysed. */
  private plainEl = this.makeElement(false);
  private active: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private hls: Hls | null = null;
  private token = 0;
  private unlocked = false;
  private volume = 0.8;
  private current: Station | null = null;
  private connecting = false;
  private lastReconnect = 0;

  fadeIn = true;

  onStatus: (s: PlayStatus, analysed: boolean) => void = () => {};

  constructor() {
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
  }

  private makeElement(cors: boolean): HTMLAudioElement {
    const el = new Audio();
    el.preload = 'none';
    if (cors) el.crossOrigin = 'anonymous';
    el.addEventListener('waiting', () => el === this.active && this.emit('loading'));
    el.addEventListener('playing', () => el === this.active && this.emit('playing'));
    el.addEventListener('pause', () => el === this.active && !this.connecting && this.emit('paused'));
    el.addEventListener('error', () => el === this.active && this.handleDrop());
    el.addEventListener('ended', () => el === this.active && this.handleDrop());
    return el;
  }

  private unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    for (const el of [this.corsEl, this.plainEl]) {
      if (el.src) continue;
      el.src = SILENCE;
      el.play().then(() => el.pause(), () => {});
    }
    this.ensureGraph();
  }

  private ensureGraph() {
    if (this.ctx || IS_IOS) return;
    try {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.78;
      const src = this.ctx.createMediaElementSource(this.corsEl);
      src.connect(this.analyser).connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.analyser = null;
    }
  }

  private emit(s: PlayStatus) {
    this.onStatus(s, s === 'playing' && this.active === this.corsEl && !!this.analyser);
  }

  /** Fills `buf` with frequency data. Returns false when no real analysis is available. */
  frequencies(buf: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || this.active !== this.corsEl || this.corsEl.paused) return false;
    this.analyser.getByteFrequencyData(buf);
    return true;
  }

  get analysable() {
    return !!this.analyser && this.active === this.corsEl;
  }

  async play(station: Station) {
    const token = ++this.token;
    this.current = station;
    this.unlock();
    this.stopElements();
    this.emit('loading');
    void this.ctx?.resume();

    let url: string | null = null;
    try {
      url = await resolveStream(station.id);
    } catch {
      /* fall back to the edge proxy below */
    }
    if (token !== this.token) return;

    const routable = !!this.analyser;
    const attempts: Attempt[] = [];
    if (url?.startsWith('https:')) {
      if (routable) attempts.push({ src: url, cors: true });
      attempts.push({ src: url, cors: false });
    }
    attempts.push({ src: proxiedStreamUrl(station.id), cors: routable });

    this.connecting = true;
    try {
      for (const a of attempts) {
        if (token !== this.token) return;
        if (await this.tryAttempt(a, token)) return;
      }
      if (token === this.token) {
        this.stopElements();
        this.emit('error');
      }
    } finally {
      if (token === this.token) this.connecting = false;
    }
  }

  private async tryAttempt({ src, cors }: Attempt, token: number): Promise<boolean> {
    this.stopElements();
    const el = cors ? this.corsEl : this.plainEl;
    el.volume = this.fadeIn ? 0 : this.volume;
    this.active = el;

    const isHls = /\.m3u8(\?|$)/i.test(src);
    if (isHls && !el.canPlayType('application/vnd.apple.mpegurl')) {
      const { default: HlsCtor } = await import('hls.js');
      if (token !== this.token || !HlsCtor.isSupported()) return false;
      this.hls = new HlsCtor({ lowLatencyMode: false });
      this.hls.loadSource(src);
      this.hls.attachMedia(el);
    } else {
      el.src = src;
    }

    return new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        el.removeEventListener('playing', onOk);
        el.removeEventListener('error', onFail);
        if (ok && token === this.token) this.rampIn(el, token);
        resolve(ok && token === this.token);
      };
      const onOk = () => done(true);
      const onFail = () => done(false);
      const timer = setTimeout(onFail, ATTEMPT_TIMEOUT_MS);
      el.addEventListener('playing', onOk);
      el.addEventListener('error', onFail);
      el.play().catch((e: DOMException) => {
        // NotAllowedError means autoplay was blocked; surface as paused so the user can tap play.
        if (e?.name === 'NotAllowedError' && token === this.token) {
          clearTimeout(timer);
          this.emit('paused');
          resolve(true);
        } else if (e?.name !== 'AbortError') onFail();
      });
    });
  }

  /** Smooth fade-in so switching stations doesn't blast. */
  private rampIn(el: HTMLAudioElement, token: number) {
    if (!this.fadeIn || document.hidden) return void (el.volume = this.volume);
    const start = performance.now();
    const DURATION = 1400;
    // rAF stalls in background tabs; make sure we always end at full volume.
    setTimeout(() => token === this.token && el === this.active && (el.volume = this.volume), DURATION + 300);
    const step = (now: number) => {
      if (token !== this.token || el !== this.active) return;
      const t = Math.min(1, (now - start) / DURATION);
      el.volume = this.volume * t * t;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private handleDrop() {
    if (!this.current || this.connecting) return;
    // Live streams drop now and then; reconnect, but not in a tight loop.
    const now = Date.now();
    if (now - this.lastReconnect < 20_000) return this.emit('error');
    this.lastReconnect = now;
    const station = this.current;
    const token = this.token;
    this.emit('loading');
    setTimeout(() => token === this.token && void this.play(station), 1200);
  }

  private stopElements() {
    this.hls?.destroy();
    this.hls = null;
    for (const el of [this.corsEl, this.plainEl]) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    this.active = null;
  }

  toggle() {
    const el = this.active;
    if (!el) {
      if (this.current) void this.play(this.current);
      return;
    }
    if (el.paused) {
      // Live radio: resuming after a pause should jump back to "now", so reload the station.
      if (this.current) void this.play(this.current);
    } else {
      el.pause();
    }
  }

  stop() {
    this.token++;
    this.connecting = false;
    this.stopElements();
    this.emit('idle');
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.active) this.active.volume = this.volume;
  }
}

export const audio = new AudioEngine();
