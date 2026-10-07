import { useEffect, useState } from 'preact/hooks';
import type { PlayStatus } from '../audio';
import {
  analysed, current, deckOpen, favorites, isFavorite, locateCurrent, playStation, scan,
  setSleep, sleepAt, status, step, toggleFavorite, togglePlay, volume,
} from '../store';
import {
  IconChevronDown, IconHeart, IconHeartFill, IconMoon, IconNext, IconPause, IconPlay, IconPrev,
  IconShuffle, IconTarget,
} from './icons';
import { settings } from '../settings';
import { Knob } from './Knob';
import { Visualizer } from './Visualizer';

const buzz = () => navigator.vibrate?.(8);

/** "United States" → "US", "Germany" → "GER" */
const countryTag = (country: string) => {
  const words = country.split(/[\s-]+/).filter((w) => /^[A-Z]/.test(w));
  return (words.length > 1 ? words.map((w) => w[0]).join('') : country.slice(0, 3)).toUpperCase().slice(0, 4);
};

const STATUS_LABEL: Record<PlayStatus, string> = {
  idle: 'STANDBY',
  loading: 'TUNING…',
  playing: 'ON AIR',
  paused: 'PAUSED',
  error: 'NO SIGNAL',
};

function PlayButton({ big }: { big?: boolean }) {
  const s = status.value;
  const busy = s === 'loading';
  return (
    <button
      class={`play-btn${big ? ' play-btn-lg' : ''}${busy ? ' is-busy' : ''}`}
      aria-label={s === 'playing' ? 'Pause' : 'Play'}
      onClick={(e) => {
        e.stopPropagation();
        buzz();
        togglePlay();
      }}
    >
      {s === 'playing' || busy ? <IconPause size={big ? 32 : 22} /> : <IconPlay size={big ? 32 : 22} />}
    </button>
  );
}

function SleepButton() {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!sleepAt.value) return;
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [sleepAt.value]);

  const first = settings.value.sleepDefault;
  const steps = [null, first, ...[15, 30, 60, 90].filter((m) => m > first)];
  const left = sleepAt.value ? Math.ceil((sleepAt.value - Date.now()) / 60_000) : null;
  const cycle = () => {
    const idx = left == null ? 0 : steps.findIndex((m) => m != null && m >= left);
    setSleep(steps[(idx + 1) % steps.length]);
  };
  return (
    <button class={`deck-tool${left ? ' is-on' : ''}`} onClick={cycle} aria-label="Sleep timer">
      <IconMoon size={18} />
      <span>{left ? `${left}m` : 'Sleep'}</span>
    </button>
  );
}

function CuePads() {
  const pads = favorites.value.slice(0, 8);
  return (
    <div class="cue-pads">
      {Array.from({ length: 8 }, (_, i) => {
        const st = pads[i];
        const active = st && current.value?.id === st.id;
        return (
          <button
            key={i}
            class={`cue${st ? '' : ' is-empty'}${active ? ' is-active' : ''}`}
            style={{ '--hue': `${(i * 45 + 80) % 360}` }}
            disabled={!st}
            onClick={() => {
              buzz();
              if (st) playStation(st, pads);
            }}
            aria-label={st ? `Cue ${i + 1}: ${st.title}` : `Cue ${i + 1} empty`}
          >
            <span class="cue-num">{i + 1}</span>
            <span class="cue-name">{st?.title ?? '—'}</span>
          </button>
        );
      })}
    </div>
  );
}

function FullDeck() {
  const st = current.value;
  const s = status.value;
  const fav = st ? isFavorite(st.id) : false;

  return (
    <div class="deck" role="dialog" aria-label="Player deck">
      <header class="deck-head">
        <button class="icon-btn" aria-label="Collapse deck" onClick={() => (deckOpen.value = false)}>
          <IconChevronDown />
        </button>
        <span class={`badge badge-${s}`}>{STATUS_LABEL[s]}</span>
        <span class="badge badge-ghost" title={analysed.value ? 'Live spectrum analysis' : 'Simulated visuals (stream blocks analysis)'}>
          {analysed.value ? 'FFT' : 'SIM'}
        </span>
      </header>

      <div class={`platter-wrap${s === 'playing' ? ' is-spinning' : ''}`}>
        {settings.value.visualizer === 'ring' && <Visualizer mode="ring" class="ring-viz" />}
        <div class="platter" onClick={() => { buzz(); togglePlay(); }}>
          <div class="platter-grooves" />
          <div class="platter-label">
            <span>{st ? countryTag(st.country) : 'FM'}</span>
          </div>
        </div>
        <div class="tonearm" aria-hidden="true" />
      </div>

      {settings.value.visualizer === 'bars' && <Visualizer mode="bars" class="deck-bars" />}

      <div class="deck-info">
        <h2 class="deck-title marquee"><span>{st?.title ?? 'Pick a station'}</span></h2>
        <p class="deck-sub">{st ? `${st.placeTitle}, ${st.country}` : 'Spin the globe or hit SCAN'}</p>
      </div>

      <div class="deck-transport">
        <button class="icon-btn icon-btn-lg" aria-label="Previous station" onClick={() => { buzz(); step(-1); }}>
          <IconPrev />
        </button>
        <PlayButton big />
        <button class="icon-btn icon-btn-lg" aria-label="Next station" onClick={() => { buzz(); step(1); }}>
          <IconNext />
        </button>
      </div>

      <div class="deck-row">
        <Knob label="VOL" value={volume.value} onChange={(v) => (volume.value = v)} />
        <div class="deck-tools">
          <button class="deck-tool deck-tool-scan" onClick={() => { buzz(); void scan(); }}>
            <IconShuffle size={18} /><span>Scan</span>
          </button>
          <button class="deck-tool" onClick={() => { locateCurrent(); deckOpen.value = false; }} disabled={!st}>
            <IconTarget size={18} /><span>Locate</span>
          </button>
          <button class={`deck-tool${fav ? ' is-on' : ''}`} onClick={() => st && toggleFavorite(st)} disabled={!st}>
            {fav ? <IconHeartFill size={18} /> : <IconHeart size={18} />}<span>Save</span>
          </button>
          <SleepButton />
        </div>
      </div>

      <h3 class="section-label">Cue pads</h3>
      <CuePads />
    </div>
  );
}

function MiniBar() {
  const st = current.value;
  if (!st) {
    return (
      <div class="mini mini-empty">
        <p>Tap a glowing dot, or let fate pick.</p>
        <button class="scan-cta" onClick={() => { buzz(); void scan(); }}>
          <IconShuffle size={18} /> SCAN
        </button>
      </div>
    );
  }
  return (
    <div class="mini" onClick={() => (deckOpen.value = true)} role="button" tabIndex={0}
      aria-label="Open player deck" onKeyDown={(e) => e.key === 'Enter' && (deckOpen.value = true)}>
      {settings.value.visualizer !== 'off' && <Visualizer mode="bars" class="mini-viz" />}
      <div class={`mini-disc${status.value === 'playing' ? ' is-spinning' : ''}`} aria-hidden="true" />
      <div class="mini-text">
        <span class="mini-title">{st.title}</span>
        <span class="mini-sub">
          <span class={`dot dot-${status.value}`} /> {STATUS_LABEL[status.value]} · {st.placeTitle}
        </span>
      </div>
      <button class="icon-btn" aria-label="Next station" onClick={(e) => { e.stopPropagation(); buzz(); step(1); }}>
        <IconNext />
      </button>
      <PlayButton />
    </div>
  );
}

export function PlayerDeck() {
  return deckOpen.value ? <FullDeck /> : <MiniBar />;
}
