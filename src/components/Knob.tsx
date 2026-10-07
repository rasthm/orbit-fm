import { useRef } from 'preact/hooks';

type Props = {
  value: number; // 0..1
  onChange: (v: number) => void;
  label: string;
  size?: number;
};

const SWEEP = 270; // degrees of travel, like a real mixer knob

/** DJ-style rotary knob: drag up/down (or sideways), scroll, or use arrow keys. */
export function Knob({ value, onChange, label, size = 64 }: Props) {
  const drag = useRef<{ y: number; x: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const angle = -SWEEP / 2 + value * SWEEP;

  const r = 42;
  const circ = 2 * Math.PI * r;
  const arc = (SWEEP / 360) * circ;

  return (
    <div
      class="knob"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      style={{ width: `${size}px`, height: `${size}px` }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, x: e.clientX, v: value };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const delta = (d.y - e.clientY + (e.clientX - d.x)) / 160;
        onChange(clamp(d.v + delta));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onWheel={(e) => {
        e.preventDefault();
        onChange(clamp(value - Math.sign(e.deltaY) * 0.05));
      }}
      onKeyDown={(e) => {
        const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 }[e.key];
        if (step) {
          e.preventDefault();
          onChange(clamp(value + step));
        }
      }}
    >
      <svg viewBox="0 0 100 100">
        <circle
          cx="50" cy="50" r={r} class="knob-track"
          stroke-dasharray={`${arc} ${circ}`}
          transform={`rotate(${90 + (360 - SWEEP) / 2} 50 50)`}
        />
        <circle
          cx="50" cy="50" r={r} class="knob-value"
          stroke-dasharray={`${arc * value} ${circ}`}
          transform={`rotate(${90 + (360 - SWEEP) / 2} 50 50)`}
        />
        <g transform={`rotate(${angle} 50 50)`}>
          <circle cx="50" cy="50" r="30" class="knob-cap" />
          <line x1="50" y1="26" x2="50" y2="38" class="knob-tick" />
        </g>
      </svg>
      <span class="knob-label">{label}</span>
    </div>
  );
}
