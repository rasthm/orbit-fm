# ORBIT.FM

A techno / DJ-styled web radio PWA. Spin a 3D globe, tap a glowing city and tune into any of ~38,000 live stations from [radio.garden](https://radio.garden).

## Stack

| Layer | Choice |
| --- | --- |
| UI | Preact + `@preact/signals`, TypeScript, Vite |
| Globe | MapLibre GL (globe projection) + OpenFreeMap vector tiles (free, no key) |
| Audio | `<audio>` + Web Audio analyser, `hls.js` (lazy) for HLS streams, Media Session API |
| PWA | `vite-plugin-pwa` (Workbox) |
| Edge | One Cloudflare Worker: serves the static app and proxies `/api/*` |

## Why the Worker exists

radio.garden's API is **unofficial and undocumented**. It sends no CORS headers and challenges non-browser clients, so the browser can't call it directly. The Worker (`worker/index.ts`) adds browser headers, caches responses at the edge and trims the payloads:

| Route | Upstream | Cache |
| --- | --- | --- |
| `GET /api/places` | `ara/content/places` (compacted to arrays) | 12 h |
| `GET /api/place/:id` | `ara/content/page/:id/channels` | 6 h |
| `GET /api/search?q=` | `search?q=` | 1 h |
| `GET /api/resolve/:id` | follows the `listen/:id/channel.mp3` redirect | none |
| `GET /api/stream/:id` | pipes the audio itself (for `http://` or CORS-less streams) | none |

Playback tries, in order: direct HTTPS with CORS (real FFT visualiser) → direct HTTPS without CORS (simulated visualiser) → the edge stream proxy. On iOS the analyser is skipped so audio keeps playing with the screen locked.

## Develop

```bash
npm install
npm run build        # type-check app + worker, build the PWA into dist/
npx wrangler dev     # full stack on http://127.0.0.1:8787
```

For hot reload, run `npm run dev:api` (Worker on :8787) and `npm run dev` (Vite proxies `/api` to it) in two terminals.

## Deploy (Cloudflare)

```bash
npx wrangler login
npm run deploy       # builds, then `wrangler deploy` → https://orbit-fm.<your-subdomain>.workers.dev
```

## Keyboard

`Space` play/pause · `/` search · `N` / `P` next/previous · `R` random scan · `Esc` close

## Roadmap

- [x] API research, Worker proxy with caching
- [x] Globe with clustered stations, auto-spin, fly-to, live marker
- [x] Audio engine with fallbacks, reconnect, HLS, Media Session
- [x] Search, place sheet, favourites, recents, 8 cue pads, sleep timer, scan
- [x] DJ deck: turntable, ring + bar visualisers (FFT or simulated), volume knob
- [x] PWA: manifest, icons, offline app shell, tile/API caching, install prompt
- [ ] Deploy to Cloudflare and test install on a real Android + iPhone
- [ ] Lighthouse pass (performance / accessibility)
- [ ] Code-split MapLibre so the first paint is faster
- [ ] Optional: "now playing" song titles (ICY metadata) via the Worker
- [ ] Optional: share links (`/listen/:id`) that open straight into a station

## Credits

Station data from radio.garden (unofficial API, not affiliated). Map © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors.
