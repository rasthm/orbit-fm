import { computed, effect, signal } from '@preact/signals';
import { fetchPlace, fetchPlaces, type Place, type PlaceDetail, type Station } from './api';
import { audio, type PlayStatus } from './audio';
import { settings } from './settings';
import { TICK_INTERVAL, trackStationChange, trackTick } from './taste';

// ---------- persistence helpers ----------

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function persist<T>(key: string, s: { value: T }) {
  effect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(s.value));
    } catch {
      /* storage full or blocked: favourites just won't survive a reload */
    }
  });
}

// ---------- state ----------

export const places = signal<Place[]>([]);
export const placesById = computed(() => new Map(places.value.map((p) => [p.id, p])));
export const placesError = signal<string | null>(null);

export const selectedPlace = signal<PlaceDetail | null>(null);
export const placeLoading = signal<string | null>(null);

// With "resume last station" on, the last station is ready in the player (not auto-played:
// browsers block audio until the listener interacts).
export const current = signal<Station | null>(
  settings.value.resumeLast ? load<Station | null>('orbit.last', null) : null,
);
export const status = signal<PlayStatus>('idle');
export const analysed = signal(false);
export const queue = signal<Station[]>([]);

export const volume = signal<number>(load('orbit.volume', 0.8));
export const favorites = signal<Station[]>(load('orbit.favorites', []));
export const recents = signal<Station[]>(load('orbit.recents', []));

export type Panel = 'none' | 'search' | 'library' | 'settings';
export const panel = signal<Panel>('none');
export const deckOpen = signal(false);

/** Asks the globe to fly somewhere; the globe clears it once handled. */
export const flyTarget = signal<{ lon: number; lat: number; zoom?: number } | null>(null);

export const sleepAt = signal<number | null>(null);

persist('orbit.volume', volume);
persist('orbit.favorites', favorites);
persist('orbit.recents', recents);
persist('orbit.last', current);

effect(() => audio.setVolume(volume.value));
effect(() => {
  audio.fadeIn = settings.value.fadeIn;
});

let autoSkips = 0;

audio.onStatus = (s, real) => {
  status.value = s;
  analysed.value = real;
  if (s === 'playing') autoSkips = 0;
  // Dead stream: hop to the next one in the list, but don't chain forever.
  if (s === 'error' && settings.value.autoSkip && queue.value.length > 1 && autoSkips < 3) {
    autoSkips++;
    const failed = current.value;
    setTimeout(() => current.value === failed && status.value === 'error' && step(1), 1500);
  }
};

// ---------- listening tracker (feeds the taste profile) ----------

let trackedStation: Station | null = null;
effect(() => {
  const st = current.value;
  if (st?.id !== trackedStation?.id) {
    trackStationChange(st, trackedStation);
    trackedStation = st;
  }
});
// Background listening (screen off, other tab) counts too.
setInterval(() => {
  if (status.value === 'playing' && current.value) trackTick(current.value);
}, TICK_INTERVAL);

export const isFavorite = (id: string) => favorites.value.some((s) => s.id === id);

// ---------- actions ----------

export async function loadPlaces() {
  try {
    placesError.value = null;
    places.value = await fetchPlaces();
  } catch (e) {
    placesError.value = (e as Error).message;
  }
}

let placeAbort: AbortController | null = null;

export async function openPlace(id: string, fly = false) {
  placeAbort?.abort();
  placeAbort = new AbortController();
  placeLoading.value = id;
  const p = placesById.value.get(id);
  if (fly && p) flyTarget.value = { lon: p.lon, lat: p.lat, zoom: 5 };
  try {
    const detail = await fetchPlace(id, placeAbort.signal);
    selectedPlace.value = detail;
    panel.value = 'none';
    return detail;
  } catch (e) {
    if ((e as Error).name !== 'AbortError') throw e;
    return null;
  } finally {
    if (placeLoading.value === id) placeLoading.value = null;
  }
}

export function closePlace() {
  placeAbort?.abort();
  selectedPlace.value = null;
}

export function playStation(station: Station, list?: Station[]) {
  current.value = station;
  if (list) queue.value = list;
  else if (!queue.value.some((s) => s.id === station.id)) queue.value = [station];
  recents.value = [station, ...recents.value.filter((s) => s.id !== station.id)].slice(0, 30);
  // Stations picked from search, favourites or a cross-city queue: bring their city into view.
  if (station.placeId !== selectedPlace.value?.id) locateCurrent();
  void audio.play(station);
}

export function togglePlay() {
  const st = current.value;
  if (!st) return;
  if (status.value === 'idle' || status.value === 'error') void audio.play(st);
  else audio.toggle();
}

export function step(dir: 1 | -1) {
  const list = queue.value;
  if (!current.value || list.length < 2) return void scan();
  const i = list.findIndex((s) => s.id === current.value!.id);
  const next = list[(i + dir + list.length) % list.length];
  playStation(next);
}

export function toggleFavorite(station: Station) {
  favorites.value = isFavorite(station.id)
    ? favorites.value.filter((s) => s.id !== station.id)
    : [station, ...favorites.value];
}

/** Jumps to a random place on Earth (weighted by station count) and plays something there. */
export async function scan() {
  const list = places.value;
  if (!list.length) return;
  const total = list.reduce((a, p) => a + Math.sqrt(p.size), 0);
  let r = Math.random() * total;
  const pick = list.find((p) => (r -= Math.sqrt(p.size)) <= 0) ?? list[0];
  const detail = await openPlace(pick.id, true);
  if (!detail?.stations.length) return;
  const st = detail.stations[Math.floor(Math.random() * detail.stations.length)];
  playStation(st, detail.stations);
}

export function locateCurrent() {
  const st = current.value;
  const p = st && placesById.value.get(st.placeId);
  if (p) flyTarget.value = { lon: p.lon, lat: p.lat, zoom: 5 };
}

// ---------- sleep timer ----------

let sleepTimer: ReturnType<typeof setTimeout> | null = null;

export function setSleep(minutes: number | null) {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = null;
  sleepAt.value = minutes ? Date.now() + minutes * 60_000 : null;
  if (minutes) {
    sleepTimer = setTimeout(() => {
      audio.stop();
      sleepAt.value = null;
    }, minutes * 60_000);
  }
}

// ---------- media session (lock screen / headset controls) ----------

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  effect(() => {
    const st = current.value;
    ms.metadata = st
      ? new MediaMetadata({
          title: st.title,
          artist: `${st.placeTitle}, ${st.country}`,
          album: 'ORBIT.FM · Live',
          artwork: [{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }],
        })
      : null;
  });
  effect(() => {
    ms.playbackState =
      status.value === 'playing' ? 'playing' : status.value === 'paused' ? 'paused' : 'none';
  });
  const handlers: [MediaSessionAction, () => void][] = [
    ['play', togglePlay],
    ['pause', togglePlay],
    ['stop', () => audio.stop()],
    ['nexttrack', () => step(1)],
    ['previoustrack', () => step(-1)],
  ];
  for (const [action, fn] of handlers) {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* action unsupported on this platform */
    }
  }
}
