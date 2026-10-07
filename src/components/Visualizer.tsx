import { useEffect, useRef } from 'preact/hooks';
import { audio } from '../audio';
import { status } from '../store';

const BINS = 64;
const BPM = 126;

/** Plausible techno-ish spectrum for streams we can't analyse (no CORS, iOS). */
function simulate(out: Float32Array, t: number) {
  const beat = (t * BPM) / 60;
  const kick = Math.exp(-(beat % 1) * 7);
  const hat = Math.exp(-((beat + 0.5) % 1) * 14);
  for (let i = 0; i < out.length; i++) {
    const f = i / out.length;
    const body = 0.55 - f * 0.35 + 0.12 * Math.sin(t * 1.3 + i * 0.45) + 0.08 * Math.sin(t * 3.7 + i * 1.7);
    const low = f < 0.18 ? kick * (1 - f * 4) * 0.6 : 0;
    const high = f > 0.6 ? hat * 0.35 * f : 0;
    out[i] = Math.max(0, Math.min(1, body * (0.75 + 0.25 * kick) + low + high + (Math.random() - 0.5) * 0.06));
  }
}

type Props = { mode: 'bars' | 'ring'; class?: string };

export function Visualizer({ mode, class: cls }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext('2d')!;
    const raw = new Uint8Array(256);
    const target = new Float32Array(BINS);
    const level = new Float32Array(BINS);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const playing = status.value === 'playing';
      if (playing && audio.frequencies(raw)) {
        // Log-ish bin mapping so bass doesn't hog the display.
        for (let i = 0; i < BINS; i++) {
          const idx = Math.floor(Math.pow(i / BINS, 1.7) * 180) + 1;
          target[i] = raw[idx] / 255;
        }
      } else if (playing) {
        simulate(target, now / 1000);
      } else {
        target.fill(0);
      }
      for (let i = 0; i < BINS; i++) {
        const k = target[i] > level[i] ? 0.55 : 0.12;
        level[i] += (target[i] - level[i]) * (reduced ? 0.05 : k);
      }

      const { width: w, height: h } = canvas;
      g.clearRect(0, 0, w, h);
      if (mode === 'bars') drawBars(g, w, h, level);
      else drawRing(g, w, h, level);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [mode]);

  return <canvas ref={ref} class={cls} aria-hidden="true" />;
}

function drawBars(g: CanvasRenderingContext2D, w: number, h: number, level: Float32Array) {
  const n = level.length;
  const gap = w / n;
  const bw = Math.max(1, gap * 0.62);
  const grad = g.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, '#2ce8ff');
  grad.addColorStop(0.6, '#b6ff3c');
  grad.addColorStop(1, '#ff2bd6');
  g.fillStyle = grad;
  g.shadowColor = '#b6ff3c';
  g.shadowBlur = 12;
  for (let i = 0; i < n; i++) {
    const bh = Math.max(h * 0.02, level[i] * h * 0.95);
    g.fillRect(i * gap + (gap - bw) / 2, h - bh, bw, bh);
  }
}

function drawRing(g: CanvasRenderingContext2D, w: number, h: number, level: Float32Array) {
  const cx = w / 2;
  const cy = h / 2;
  const r0 = Math.min(w, h) * 0.405;
  const span = Math.min(w, h) * 0.085;
  const n = level.length;
  g.lineCap = 'round';
  g.lineWidth = Math.max(1.5, ((Math.PI * 2 * r0) / (n * 2)) * 0.38);
  g.shadowBlur = 8;
  // Mirror the spectrum so the ring is symmetrical.
  for (let k = 0; k < n * 2; k++) {
    const i = k < n ? k : n * 2 - 1 - k;
    const v = level[i];
    const a = (k / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const len = 2 + v * v * span * 1.4;
    const hue = 185 + (i / n) * 130;
    g.globalAlpha = 0.45 + v * 0.55;
    g.strokeStyle = `hsl(${hue} 100% ${52 + v * 12}%)`;
    g.shadowColor = g.strokeStyle;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
    g.stroke();
  }
  g.globalAlpha = 1;
}
