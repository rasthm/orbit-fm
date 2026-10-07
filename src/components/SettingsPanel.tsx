import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { GENRES } from '../genres';
import { ACCENTS, DEFAULTS, resetSettings, settings, updateSettings, type Accent, type Settings } from '../settings';
import { favorites, panel, recents } from '../store';
import { clearHistory, hourly, profile, refreshRecs, recsLoading, stats } from '../taste';
import { IconClose } from './icons';

const VERSION = '1.1.0';

// ---------- small controls ----------

function Row({ label, hint, children }: { label: string; hint?: string; children: ComponentChildren }) {
  return (
    <div class="set-row">
      <div class="set-text">
        <span class="set-label">{label}</span>
        {hint && <span class="set-hint">{hint}</span>}
      </div>
      <div class="set-control">{children}</div>
    </div>
  );
}

function Toggle<K extends keyof Settings>({ k, label, hint }: { k: K; label: string; hint?: string }) {
  const on = settings.value[k] as boolean;
  return (
    <Row label={label} hint={hint}>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        class={`switch${on ? ' is-on' : ''}`}
        onClick={() => updateSettings({ [k]: !on } as Partial<Settings>)}
      >
        <i />
      </button>
    </Row>
  );
}

function Segmented<K extends keyof Settings>({
  k, label, hint, options,
}: { k: K; label: string; hint?: string; options: [Settings[K], string][] }) {
  const value = settings.value[k];
  return (
    <Row label={label} hint={hint}>
      <div class="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            role="radio"
            aria-checked={value === v}
            class={value === v ? 'is-on' : ''}
            onClick={() => updateSettings({ [k]: v } as Partial<Settings>)}
          >
            {text}
          </button>
        ))}
      </div>
    </Row>
  );
}

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="set-section">
      <h3 class="section-label">{title}</h3>
      <div class="set-card">{children}</div>
    </section>
  );
}

// ---------- taste card ----------

const fmtHours = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${(m / 60).toFixed(m < 600 ? 1 : 0)} h`;
};

function TasteCard() {
  const p = profile.value;
  const peak = Math.max(...hourly.value, 1);

  if (!p.ready) {
    return (
      <div class="taste taste-empty">
        <p>
          Listen to <b>{p.needed - p.qualifiedCount}</b> more station{p.needed - p.qualifiedCount === 1 ? '' : 's'} for
          at least 2 minutes each and ORBIT.FM will learn your taste, then light up stations you'll probably like with
          <span class="red-dot" /> red rings on the globe.
        </p>
        <div class="taste-progress" aria-hidden="true">
          {Array.from({ length: p.needed }, (_, i) => <i key={i} class={i < p.qualifiedCount ? 'is-on' : ''} />)}
        </div>
      </div>
    );
  }

  const top = p.consistent[0];
  return (
    <div class="taste">
      <div class="taste-stats">
        <div><b>{fmtHours(p.totalMs)}</b><span>listened</span></div>
        <div><b>{p.stationsHeard}</b><span>stations</span></div>
        <div><b>{p.countries.length}</b><span>countries</span></div>
      </div>

      <h4>Top genres</h4>
      <ul class="taste-bars">
        {p.genres.slice(0, 4).map(([g, v]) => (
          <li key={g}>
            <span>{GENRES[g].label}</span>
            <i style={{ width: `${Math.round(v * 100)}%` }} />
            <small>{Math.round(v * 100)}%</small>
          </li>
        ))}
        {!p.genres.length && <li class="set-hint">Not enough genre info yet. Keep listening!</li>}
      </ul>

      <h4>Where you tune in</h4>
      <p class="taste-chips">
        {p.countries.slice(0, 5).map(([c]) => <span key={c} class="chip chip-static">{c}</span>)}
      </p>

      {top && (
        <>
          <h4>Most consistent</h4>
          <p class="taste-line">
            <b>{top.station.title}</b> · {top.station.placeTitle} · {top.days.length} day{top.days.length === 1 ? '' : 's'}, {fmtHours(top.ms)}
          </p>
        </>
      )}

      <h4>When you listen {p.chronotype && <em class="taste-badge">{p.chronotype}</em>}</h4>
      <div class="taste-hours" aria-label="Listening by hour of day">
        {hourly.value.map((v, h) => (
          <i key={h} style={{ height: `${Math.max(4, (v / peak) * 100)}%` }} title={`${h}:00`} />
        ))}
      </div>
      <div class="taste-hours-axis"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>
    </div>
  );
}

// ---------- data: export / import ----------

function exportData() {
  const data = {
    app: 'orbit.fm',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: settings.value,
    favorites: favorites.value,
    recents: recents.value,
    stats: stats.value,
    hourly: hourly.value,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `orbit-fm-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file: File): Promise<string> {
  try {
    const data = JSON.parse(await file.text());
    if (data?.app !== 'orbit.fm') return 'That file is not an ORBIT.FM backup.';
    if (data.settings && typeof data.settings === 'object') updateSettings({ ...DEFAULTS, ...data.settings, v: 1 });
    if (Array.isArray(data.favorites)) favorites.value = data.favorites.filter((s: any) => s?.id && s?.title);
    if (Array.isArray(data.recents)) recents.value = data.recents.filter((s: any) => s?.id && s?.title);
    if (data.stats && typeof data.stats === 'object') stats.value = data.stats;
    if (Array.isArray(data.hourly) && data.hourly.length === 24) hourly.value = data.hourly.map(Number);
    refreshRecs(true);
    return `Imported ${favorites.value.length} favourites and your listening history.`;
  } catch {
    return 'Could not read that file.';
  }
}

// ---------- panel ----------

export function SettingsPanel() {
  const s = settings.value;
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'history' | 'all' | null>(null);

  return (
    <div class="overlay" role="dialog" aria-label="Settings" onClick={(e) => e.target === e.currentTarget && (panel.value = 'none')}>
      <div class="sheet settings-panel">
        <header class="sheet-head">
          <h2 class="sheet-title">Settings</h2>
          <button class="icon-btn" aria-label="Close settings" onClick={() => (panel.value = 'none')}>
            <IconClose />
          </button>
        </header>

        <div class="settings-scroll">
          <Section title="Your taste">
            <TasteCard />
          </Section>

          <Section title="Globe">
            <Segmented k="dayNight" label="Day & night" hint="Real-time shows actual sunlight right now"
              options={[['real', 'Real-time'], ['night', 'Night'], ['day', 'Day']]} />
            <Toggle k="autoSpin" label="Auto-spin when idle" />
            {s.autoSpin && (
              <Segmented k="spinSpeed" label="Spin speed" options={[[1, 'Slow'], [2, 'Normal'], [3, 'Fast']]} />
            )}
            <Toggle k="labels" label="Country & city names" />
            <Toggle k="space" label="Sun, Moon & planets" hint="Shown where they really are in the sky right now" />
            <Toggle k="shootingStars" label="Shooting stars" />
            <Toggle k="showForYou" label="Show For You rings" hint="Red rings mark stations picked for you" />
          </Section>

          <Section title="Look">
            <Row label="Accent colour">
              <div class="swatches" role="radiogroup" aria-label="Accent colour">
                {(Object.keys(ACCENTS) as Accent[]).map((a) => (
                  <button
                    key={a}
                    role="radio"
                    aria-checked={s.accent === a}
                    aria-label={ACCENTS[a].name}
                    title={ACCENTS[a].name}
                    class={`swatch${s.accent === a ? ' is-on' : ''}`}
                    style={{ '--c': ACCENTS[a].color }}
                    onClick={() => updateSettings({ accent: a })}
                  />
                ))}
              </div>
            </Row>
            <Segmented k="visualizer" label="Visualizer" options={[['ring', 'Ring'], ['bars', 'Bars'], ['off', 'Off']]} />
            <Toggle k="scanlines" label="CRT scanlines" />
            <Segmented k="motion" label="Motion" hint="Reduced turns off spinning and fly animations"
              options={[['system', 'System'], ['full', 'Full'], ['reduced', 'Reduced']]} />
          </Section>

          <Section title="Audio">
            <Toggle k="resumeLast" label="Remember last station" hint="Ready to play when you reopen the app" />
            <Toggle k="fadeIn" label="Fade in on tune" />
            <Toggle k="autoSkip" label="Skip dead stations" hint="Jumps to the next station if one won't play" />
            <Segmented k="sleepDefault" label="Sleep timer starts at"
              options={[[15, '15m'], [30, '30m'], [60, '60m'], [90, '90m']]} />
          </Section>

          <Section title="Discovery">
            <Toggle k="recommendations" label="Recommendations" hint="Learns from what you listen to. Stays on this device." />
            {s.recommendations && (
              <>
                <Row label="Adventure" hint={s.adventure < 0.34 ? 'Close to home' : s.adventure < 0.67 ? 'Balanced' : 'Anywhere on Earth'}>
                  <input
                    class="range"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={s.adventure}
                    aria-label="Adventure"
                    onChange={(e) => updateSettings({ adventure: +(e.target as HTMLInputElement).value })}
                  />
                </Row>
                {(s.hiddenCountries.length > 0 || s.hiddenStations.length > 0) && (
                  <Row label="Hidden" hint={`${s.hiddenStations.length} station(s)${s.hiddenCountries.length ? `, ${s.hiddenCountries.join(', ')}` : ''}`}>
                    <button class="pill pill-ghost" onClick={() => updateSettings({ hiddenStations: [], hiddenCountries: [] })}>
                      Unhide all
                    </button>
                  </Row>
                )}
                <Row label="Refresh picks" hint={recsLoading.value ? 'Finding stations…' : 'Picks also refresh on their own as your taste changes'}>
                  <button class="pill pill-ghost" disabled={!profile.value.ready || recsLoading.value} onClick={() => refreshRecs(true)}>
                    Refresh
                  </button>
                </Row>
              </>
            )}
          </Section>

          <Section title="Your data">
            <Row label="Export backup" hint="Favourites, history and settings as a JSON file">
              <button class="pill pill-ghost" onClick={exportData}>Export</button>
            </Row>
            <Row label="Import backup">
              <button class="pill pill-ghost" onClick={() => fileInput.current?.click()}>Import</button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) setNotice(await importData(f));
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </Row>
            <Row label="Clear listening history" hint="Resets your taste profile and For You picks">
              {confirm === 'history' ? (
                <button class="pill pill-danger" onClick={() => { clearHistory(); setConfirm(null); setNotice('Listening history cleared.'); }}>
                  Confirm
                </button>
              ) : (
                <button class="pill pill-ghost" onClick={() => setConfirm('history')}>Clear</button>
              )}
            </Row>
            <Row label="Reset settings" hint="Keeps favourites and history">
              {confirm === 'all' ? (
                <button class="pill pill-danger" onClick={() => { resetSettings(); setConfirm(null); setNotice('Settings reset.'); }}>
                  Confirm
                </button>
              ) : (
                <button class="pill pill-ghost" onClick={() => setConfirm('all')}>Reset</button>
              )}
            </Row>
            {notice && <p class="set-notice" role="status">{notice}</p>}
          </Section>

          <Section title="About">
            <div class="about">
              <p><b>ORBIT.FM</b> v{VERSION}</p>
              <p class="set-hint">
                Shortcuts: <kbd>Space</kbd> play/pause · <kbd>/</kbd> search · <kbd>N</kbd>/<kbd>P</kbd> next/prev ·
                <kbd>R</kbd> random · <kbd>,</kbd> settings · <kbd>Esc</kbd> close
              </p>
              <p class="set-hint">
                Stations from radio.garden (unofficial, not affiliated). Genre tags from Radio Browser. Map © OpenFreeMap,
                OpenMapTiles, OpenStreetMap contributors. Your listening history is stored only on this device.
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
