/**
 * Listening history → taste profile → "For You" recommendations.
 * Everything here lives in localStorage on the listener's device.
 */
import { computed, effect, signal } from '@preact/signals';
import { fetchTags, searchAll, type Station } from './api';
import { GENRES, genresOf, networkOf, type GenreId } from './genres';
import { settings } from './settings';

export type StationStat = {
  station: Station;
  ms: number; // total time actually playing
  sessions: number; // sessions longer than a minute
  skips: number; // tuned in, then left within 20s
  days: string[]; // distinct local dates with a 1min+ session
  last: number;
  tags?: string[]; // Radio Browser tags (undefined = not looked up yet)
};

export type Rec = { station: Station; score: number; reason: string };

const MIN = 60_000;
const QUALIFY_MS = 2 * MIN; // a station "counts" toward your taste after 2 minutes
const READY_AT = 3; // ...and recommendations start after 3 such stations
const SKIP_MS = 20_000;
const TICK_MS = 5_000;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

export const stats = signal<Record<string, StationStat>>(load('orbit.stats', {}));
export const hourly = signal<number[]>(load('orbit.hourly', new Array(24).fill(0)));
export const recs = signal<Rec[]>(load('orbit.recs', []));
const recsMeta = signal<{ sig: string; at: number }>(load('orbit.recsMeta', { sig: '', at: 0 }));
export const recsLoading = signal(false);

effect(() => save('orbit.stats', stats.value));
effect(() => save('orbit.hourly', hourly.value));
effect(() => save('orbit.recs', recs.value));
effect(() => save('orbit.recsMeta', recsMeta.value));

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

// ---------- tracking ----------

let session: { id: string; ms: number; counted: boolean } | null = null;

function patchStat(station: Station, fn: (s: StationStat) => void) {
  const prev = stats.value[station.id];
  const next: StationStat = prev
    ? { ...prev, station, days: [...prev.days] }
    : { station, ms: 0, sessions: 0, skips: 0, days: [], last: Date.now() };
  fn(next);
  stats.value = { ...stats.value, [station.id]: next };
}

/** Called whenever the tuned station changes (or playback stops). */
export function trackStationChange(next: Station | null, prev: Station | null) {
  if (session && prev && session.id === prev.id && session.ms > 0 && session.ms < SKIP_MS) {
    patchStat(prev, (s) => s.skips++);
  }
  session = next ? { id: next.id, ms: 0, counted: false } : null;
}

/** Called every few seconds while audio is actually playing. */
export function trackTick(station: Station) {
  if (!session || session.id !== station.id) session = { id: station.id, ms: 0, counted: false };
  session.ms += TICK_MS;
  const crossed = !session.counted && session.ms >= MIN;
  if (crossed) session.counted = true;

  patchStat(station, (s) => {
    s.ms += TICK_MS;
    s.last = Date.now();
    if (crossed) {
      s.sessions++;
      if (!s.days.includes(today())) s.days.push(today());
    }
  });

  const h = new Date().getHours();
  const hist = [...hourly.value];
  hist[h] += TICK_MS;
  hourly.value = hist;

  if (crossed && stats.value[station.id].tags === undefined) void enrich(station);
}

async function enrich(station: Station) {
  const tags = await fetchTags(station.title, station.country).catch(() => null);
  if (tags) patchStat(station, (s) => (s.tags = tags));
}

export const TICK_INTERVAL = TICK_MS;

// ---------- profile ----------

const weightOf = (s: StationStat) =>
  Math.max(0, Math.log1p(s.ms / MIN) * (1 + 0.5 * (s.days.length - 1)) - 0.4 * s.skips);

export const profile = computed(() => {
  const all = Object.values(stats.value);
  const qualified = all.filter((s) => s.ms >= QUALIFY_MS);
  const genres = new Map<GenreId, number>();
  const countries = new Map<string, number>();
  const networks = new Map<string, number>();
  let total = 0;

  for (const s of qualified) {
    const wgt = weightOf(s);
    if (!wgt) continue;
    total += wgt;
    const gs = genresOf(s.station.title, s.tags);
    for (const g of gs) genres.set(g, (genres.get(g) ?? 0) + wgt / Math.sqrt(gs.length));
    countries.set(s.station.country, (countries.get(s.station.country) ?? 0) + wgt);
    const net = networkOf(s.station.title);
    if (net) networks.set(net, (networks.get(net) ?? 0) + wgt);
  }

  const norm = <K,>(m: Map<K, number>) => {
    const sum = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()].map(([k, v]) => [k, v / sum] as [K, number]).sort((a, b) => b[1] - a[1]);
  };

  const consistent = all
    .filter((s) => s.days.length >= 2 || s.ms >= 15 * MIN)
    .sort((a, b) => weightOf(b) - weightOf(a));

  const hist = hourly.value;
  const totalMs = hist.reduce((a, b) => a + b, 0);
  const share = (hours: number[]) => hours.reduce((a, h) => a + hist[h], 0) / (totalMs || 1);
  const chronotype =
    totalMs < 10 * MIN ? null
    : share([22, 23, 0, 1, 2, 3, 4]) > 0.35 ? 'Night owl'
    : share([5, 6, 7, 8, 9]) > 0.35 ? 'Early bird'
    : share([17, 18, 19, 20, 21]) > 0.4 ? 'Evening listener'
    : 'Daytime listener';

  return {
    ready: qualified.length >= READY_AT,
    qualifiedCount: qualified.length,
    needed: READY_AT,
    genres: norm(genres),
    countries: norm(countries),
    networks: norm(networks),
    consistent,
    totalMs: all.reduce((a, s) => a + s.ms, 0),
    stationsHeard: all.filter((s) => s.ms >= MIN).length,
    chronotype,
    weightTotal: total,
  };
});

/** Changes only when the shape of your taste changes, not on every tick. */
const signature = computed(() => {
  const p = profile.value;
  const s = settings.value;
  return [
    p.genres.slice(0, 3).map(([g]) => g).join(','),
    p.countries.slice(0, 2).map(([c]) => c).join(','),
    p.networks.slice(0, 1).map(([n]) => n).join(','),
    p.qualifiedCount,
    Math.round(s.adventure * 4),
    s.hiddenCountries.join(','),
    s.hiddenStations.length,
  ].join('|');
});

// ---------- recommendations ----------

async function buildRecs(): Promise<Rec[]> {
  const p = profile.value;
  const s = settings.value;
  const topGenres = p.genres.slice(0, 3);
  const topNetwork = p.networks[0]?.[1] > 0.15 ? p.networks[0][0] : null;
  const genreW = new Map(p.genres);
  const countryW = new Map(p.countries);
  const homeCountry = p.countries[0]?.[0];

  // radio.garden search returns at most ~20 stations per query, so combine genres with the
  // countries you listen to (close to home) and plain genre searches (worldwide).
  const queries = new Set<string>(topGenres.map(([g]) => GENRES[g].search));
  if (topNetwork) queries.add(topNetwork);
  if (s.adventure < 0.8) {
    for (const [g] of topGenres.slice(0, 2)) {
      for (const [c] of p.countries.slice(0, 2)) queries.add(`${GENRES[g].search} ${c}`);
    }
  }
  if (!topGenres.length && homeCountry) queries.add(homeCountry); // no genre signal yet: lean on geography

  const results = await Promise.allSettled([...queries].map((q) => searchAll(q)));
  const seen = new Map<string, Station>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const h of r.value) if (h.type === 'station') seen.set(h.id, h);
  }

  const heard = stats.value;
  const hiddenC = new Set(s.hiddenCountries);
  const hiddenS = new Set(s.hiddenStations);

  const scored: Rec[] = [];
  for (const st of seen.values()) {
    if ((heard[st.id]?.ms ?? 0) >= MIN || hiddenS.has(st.id) || hiddenC.has(st.country)) continue;
    const gs = genresOf(st.title);
    let best: { g: GenreId; v: number } | null = null;
    let genreScore = 0;
    for (const g of gs) {
      const v = genreW.get(g) ?? 0;
      genreScore += v;
      if (!best || v > best.v) best = { g, v };
    }
    const net = networkOf(st.title);
    const netScore = net && net === topNetwork ? 0.6 : 0;
    const cw = countryW.get(st.country) ?? 0;
    const countryScore = cw * (1 - s.adventure) * 0.8 + (cw ? 0 : s.adventure * 0.15);
    const score = genreScore + netScore + countryScore + Math.random() * 0.05; // tiny shuffle between equals
    if (score < 0.05) continue;

    const reason =
      netScore && (!best || best.v < 0.3) ? `More from ${st.title.split(/\s+[-–|:]\s+/)[0]}`
      : best && best.v > 0 ? `Because you play ${GENRES[best.g].label}`
      : `From ${st.country}, where you listen most`;
    scored.push({ station: st, score, reason });
  }

  scored.sort((a, b) => b.score - a.score);
  const perPlace = new Map<string, number>();
  const out: Rec[] = [];
  for (const r of scored) {
    const n = perPlace.get(r.station.placeId) ?? 0;
    if (n >= 2) continue; // keep the globe varied
    perPlace.set(r.station.placeId, n + 1);
    out.push(r);
    if (out.length >= 20) break;
  }
  return out;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function refreshRecs(force = false) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    const p = profile.value;
    if (!settings.value.recommendations || !p.ready) return;
    const sig = signature.value;
    const stale = Date.now() - recsMeta.value.at > 60 * MIN;
    if (!force && sig === recsMeta.value.sig && !stale) return;
    recsLoading.value = true;
    try {
      recs.value = await buildRecs();
      recsMeta.value = { sig, at: Date.now() };
    } finally {
      recsLoading.value = false;
    }
  }, force ? 0 : 3000);
}

// Re-evaluate whenever the taste signature changes.
effect(() => {
  void signature.value;
  refreshRecs();
});

export function hideRec(station: Station) {
  recs.value = recs.value.filter((r) => r.station.id !== station.id);
  settings.value = {
    ...settings.value,
    hiddenStations: [...new Set([...settings.value.hiddenStations, station.id])],
  };
}

export function clearHistory() {
  stats.value = {};
  hourly.value = new Array(24).fill(0);
  recs.value = [];
  recsMeta.value = { sig: '', at: 0 };
}
