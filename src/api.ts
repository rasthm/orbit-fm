export type Place = {
  id: string;
  title: string;
  country: string;
  lon: number;
  lat: number;
  size: number;
};

export type Station = {
  id: string;
  title: string;
  placeId: string;
  placeTitle: string;
  country: string;
  secure: boolean;
};

export type PlaceDetail = {
  id: string;
  title: string;
  utcOffset: number;
  stations: Station[];
};

export type SearchHit =
  | ({ type: 'station' } & Station)
  | { type: 'place'; id: string; title: string; country: string; count: number };

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal });
  if (!res.ok) throw new Error(`API ${path} failed (${res.status})`);
  return res.json();
}

export async function fetchPlaces(): Promise<Place[]> {
  const rows = await get<[string, string, string, number, number, number][]>('/places');
  return rows.map(([id, title, country, lon, lat, size]) => ({ id, title, country, lon, lat, size }));
}

export const fetchPlace = (id: string, signal?: AbortSignal) =>
  get<PlaceDetail>(`/place/${encodeURIComponent(id)}`, signal);

export const searchAll = (q: string, signal?: AbortSignal) =>
  get<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`, signal);

export const resolveStream = (id: string, signal?: AbortSignal) =>
  get<{ url: string }>(`/resolve/${encodeURIComponent(id)}`, signal).then((r) => r.url);

export const proxiedStreamUrl = (id: string) => `/api/stream/${encodeURIComponent(id)}`;
