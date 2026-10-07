import { effect, signal } from '@preact/signals';

export type Accent = 'acid' | 'magenta' | 'cyan' | 'amber' | 'ice';

export type Settings = {
  v: 1;
  // globe
  dayNight: 'real' | 'night' | 'day';
  autoSpin: boolean;
  spinSpeed: 1 | 2 | 3;
  labels: boolean;
  showForYou: boolean;
  // look
  accent: Accent;
  visualizer: 'ring' | 'bars' | 'off';
  scanlines: boolean;
  motion: 'system' | 'reduced' | 'full';
  // audio
  resumeLast: boolean;
  fadeIn: boolean;
  autoSkip: boolean;
  sleepDefault: 15 | 30 | 60 | 90;
  // discovery
  recommendations: boolean;
  /** 0 = stay close to the countries you play, 1 = anywhere on Earth */
  adventure: number;
  hiddenCountries: string[];
  hiddenStations: string[];
};

export const DEFAULTS: Settings = {
  v: 1,
  dayNight: 'real',
  autoSpin: true,
  spinSpeed: 2,
  labels: true,
  showForYou: true,
  accent: 'acid',
  visualizer: 'ring',
  scanlines: true,
  motion: 'system',
  resumeLast: true,
  fadeIn: true,
  autoSkip: true,
  sleepDefault: 30,
  recommendations: true,
  adventure: 0.6,
  hiddenCountries: [],
  hiddenStations: [],
};

export const ACCENTS: Record<Accent, { name: string; color: string; glow: string }> = {
  acid: { name: 'Acid', color: '#b6ff3c', glow: 'rgba(182, 255, 60, 0.5)' },
  magenta: { name: 'Magenta', color: '#ff4fd8', glow: 'rgba(255, 79, 216, 0.5)' },
  cyan: { name: 'Cyan', color: '#2ce8ff', glow: 'rgba(44, 232, 255, 0.5)' },
  amber: { name: 'Amber', color: '#ffb321', glow: 'rgba(255, 179, 33, 0.5)' },
  ice: { name: 'Ice', color: '#d6f4ff', glow: 'rgba(214, 244, 255, 0.45)' },
};

const KEY = 'orbit.settings';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    // Merge over defaults so settings added in later versions get sensible values.
    return raw ? { ...DEFAULTS, ...JSON.parse(raw), v: 1 } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export const settings = signal<Settings>(loadSettings());

export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch };
}

export function resetSettings() {
  settings.value = DEFAULTS;
}

effect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings.value));
  } catch {
    /* storage blocked */
  }
});

// Apply look settings to the document so plain CSS can react to them.
const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');

export const reducedMotion = signal(false);

effect(() => {
  const s = settings.value;
  const root = document.documentElement;
  const accent = ACCENTS[s.accent] ?? ACCENTS.acid;
  root.style.setProperty('--neon', accent.color);
  root.style.setProperty('--neon-glow', accent.glow);
  root.dataset.scanlines = String(s.scanlines);
  const reduced = s.motion === 'reduced' || (s.motion === 'system' && systemReduced.matches);
  root.dataset.motion = reduced ? 'reduced' : 'full';
  reducedMotion.value = reduced;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#07070b');
});

systemReduced.addEventListener('change', () => (settings.value = { ...settings.value }));
