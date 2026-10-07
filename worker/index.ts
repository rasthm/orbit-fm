/**
 * ORBIT.FM edge worker.
 * Serves the built PWA (static assets) and proxies /api/* to radio.garden,
 * which has no CORS headers and challenges non-browser clients.
 */

interface Env {
  ASSETS: Fetcher;
}

const RG = 'https://radio.garden/api';
const UPSTREAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://radio.garden/',
};

const HOUR = 3600;

type RGChannelPage = {
  url: string;
  title: string;
  place?: { id: string; title: string };
  country?: { id: string; title: string };
  secure?: boolean;
  subtitle?: string;
};

const idFromUrl = (url: string) => url.split('/').filter(Boolean).pop() ?? '';

const toStation = (p: RGChannelPage) => ({
  id: idFromUrl(p.url),
  title: p.title,
  placeId: p.place?.id ?? '',
  placeTitle: p.place?.title ?? '',
  country: p.country?.title ?? '',
  secure: p.secure !== false,
});

function json(data: unknown, maxAge: number, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function upstream(path: string, ttl: number): Promise<any> {
  const res = await fetch(RG + path, {
    headers: UPSTREAM_HEADERS,
    cf: { cacheTtl: ttl, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, `upstream ${res.status}`);
  return res.json();
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Compact place list: [id, title, country, lon, lat, stationCount][] */
async function places() {
  const d = await upstream('/ara/content/places', 12 * HOUR);
  return d.data.list.map((p: any) => [
    p.id,
    p.title,
    p.country,
    +p.geo[0].toFixed(4),
    +p.geo[1].toFixed(4),
    p.size,
  ]);
}

async function place(id: string) {
  const d = await upstream(`/ara/content/page/${encodeURIComponent(id)}/channels`, 6 * HOUR);
  const stations = [];
  for (const block of d.data.content ?? []) {
    if (block.itemsType !== 'channel') continue;
    for (const item of block.items ?? []) if (item.page) stations.push(toStation(item.page));
  }
  return {
    id,
    title: d.data.title,
    utcOffset: d.data.utcOffset ?? 0,
    stations,
  };
}

async function search(q: string) {
  const d = await upstream(`/search?q=${encodeURIComponent(q)}`, HOUR);
  const out: any[] = [];
  for (const hit of d.hits?.hits ?? []) {
    const s = hit._source;
    if (s.type === 'channel') out.push({ type: 'station', ...toStation(s.page) });
    else if (s.type === 'place')
      out.push({
        type: 'place',
        id: s.page.map ?? idFromUrl(s.page.url),
        title: s.page.title,
        country: s.page.subtitle ?? '',
        count: s.page.count ?? 0,
      });
  }
  return out;
}

// ---------- genre tags via Radio Browser (radio-browser.info, open community database) ----------

const RB = 'https://all.api.radio-browser.info/json';
const RB_HEADERS = { 'User-Agent': 'ORBIT.FM/1.0 (+https://orbit-fm.orbit-fm.workers.dev)' };

const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1);

const STOP = new Set(['fm', 'am', 'radio', 'the', 'la', 'el', 'de', 'di', 'du', 'le', 'online', 'live', 'stream']);

/** Best-effort genre tags for a radio.garden station, matched by name within its country. */
async function tags(name: string, country: string): Promise<string[]> {
  const nameTokens = tokens(name);
  // Search on the distinctive words only: frequencies and filler words vary between databases.
  const core = nameTokens.filter((t) => !STOP.has(t) && !/^\d+$/.test(t));
  if (!core.length) return [];

  // Names are often ordered differently between databases ("Techno Underground | Fluxmusic" vs
  // "FluxFM - Techno Underground"), so widen the search with fewer words until something matches.
  const attempts = [core.slice(0, 3), core.slice(0, 2), core.length > 1 ? core.slice(1, 3) : []]
    .map((t) => t.join(' '))
    .filter((q, i, all) => q && all.indexOf(q) === i);

  let rows: { name: string; tags: string }[] = [];
  for (const q of attempts) {
    const qs = new URLSearchParams({ name: q, limit: '20', hidebroken: 'true', order: 'votes', reverse: 'true' });
    if (country) qs.set('country', country);
    const res = await fetch(`${RB}/stations/search?${qs}`, {
      headers: RB_HEADERS,
      cf: { cacheTtl: 7 * 24 * HOUR, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) throw new HttpError(502, `radio-browser ${res.status}`);
    rows = await res.json();
    if (rows.length) break;
  }

  const want = new Set(nameTokens);
  const scored = rows
    .map((r) => {
      const have = new Set(tokens(r.name));
      const inter = [...want].filter((t) => have.has(t)).length;
      return { r, score: inter / new Set([...want, ...have]).size };
    })
    .filter((x) => x.score >= 0.4 && x.r.tags)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const out = new Set<string>();
  for (const { r } of scored) for (const t of r.tags.split(',')) if (t.trim()) out.add(t.trim().toLowerCase());
  return [...out].slice(0, 12);
}

/** Resolves the real stream URL behind radio.garden's listen redirect. */
async function resolveStream(id: string): Promise<string> {
  const res = await fetch(`${RG}/ara/content/listen/${encodeURIComponent(id)}/channel.mp3`, {
    headers: UPSTREAM_HEADERS,
    redirect: 'manual',
  });
  const loc = res.headers.get('Location');
  if (!loc) throw new HttpError(404, 'stream not found');
  return loc;
}

/** Pipes an audio stream through the edge so http:// streams and CORS-less streams still play. */
async function proxyStream(id: string, req: Request): Promise<Response> {
  const url = await resolveStream(id);
  const res = await fetch(url, {
    headers: { 'User-Agent': UPSTREAM_HEADERS['User-Agent'], 'Icy-MetaData': '0' },
    signal: req.signal,
  });
  if (!res.ok || !res.body) throw new HttpError(502, `stream ${res.status}`);
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'audio/mpeg',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function api(req: Request, path: string): Promise<Response> {
  const url = new URL(req.url);
  const [, route, arg] = path.split('/'); // "/places", "/place/ID", ...

  switch (route) {
    case 'places':
      return json(await places(), 12 * HOUR);
    case 'place':
      return json(await place(arg), 6 * HOUR);
    case 'search': {
      const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
      return json(q ? await search(q) : [], HOUR);
    }
    case 'tags': {
      const name = (url.searchParams.get('name') ?? '').slice(0, 100);
      const country = (url.searchParams.get('country') ?? '').slice(0, 60);
      return json({ tags: name ? await tags(name, country) : [] }, 7 * 24 * HOUR);
    }
    case 'resolve':
      return json({ url: await resolveStream(arg) }, 0);
    case 'stream':
      return proxyStream(arg, req);
    default:
      throw new HttpError(404, 'unknown route');
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method !== 'GET') return json({ error: 'method not allowed' }, 0, 405);

    try {
      return await api(req, url.pathname.slice(4));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      return json({ error: (e as Error).message }, 0, status);
    }
  },
} satisfies ExportedHandler<Env>;
