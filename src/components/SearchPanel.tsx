import { useEffect, useRef, useState } from 'preact/hooks';
import { searchAll, type SearchHit, type Station } from '../api';
import { openPlace, panel } from '../store';
import { IconClose, IconPin } from './icons';
import { StationRow } from './StationRow';

const SUGGESTIONS = ['techno', 'house', 'jazz', 'Berlin', 'Tokyo', 'lo-fi', 'drum and bass', 'Lagos'];

export function SearchPanel() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      searchAll(term, ctrl.signal)
        .then((r) => {
          setHits(r);
          setError(false);
        })
        .catch((e) => e.name !== 'AbortError' && setError(true))
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const stations = hits.filter((h): h is { type: 'station' } & Station => h.type === 'station');
  const placeHits = hits.filter((h) => h.type === 'place');

  return (
    <div class="overlay" role="dialog" aria-label="Search" onClick={(e) => e.target === e.currentTarget && (panel.value = 'none')}>
      <div class="sheet search-panel">
        <div class="search-bar">
          <input
            ref={input}
            class="field field-lg"
            type="search"
            placeholder="Search stations, cities, countries…"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Escape' && (panel.value = 'none')}
          />
          <button class="icon-btn" aria-label="Close search" onClick={() => (panel.value = 'none')}>
            <IconClose />
          </button>
        </div>

        {q.trim().length < 2 && (
          <div class="chips">
            {SUGGESTIONS.map((s) => (
              <button class="chip" key={s} onClick={() => setQ(s)}>{s}</button>
            ))}
          </div>
        )}

        {loading && <div class="sheet-loading"><span class="spinner" /> Scanning frequencies…</div>}
        {error && !loading && <p class="empty">Search is unavailable right now. Try again in a moment.</p>}
        {!loading && !error && q.trim().length >= 2 && !hits.length && <p class="empty">No signal for “{q}”.</p>}

        <div class="search-results">
          {placeHits.length > 0 && (
            <section>
              <h3 class="section-label">Places</h3>
              <ul class="place-hits">
                {placeHits.map((p) => p.type === 'place' && (
                  <li key={p.id}>
                    <button class="place-hit" onClick={() => void openPlace(p.id, true)}>
                      <IconPin size={18} />
                      <span>
                        <b>{p.title}</b>
                        <small>{p.country} · {p.count} stations</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {stations.length > 0 && (
            <section>
              <h3 class="section-label">Stations</h3>
              <ul class="station-list">
                {stations.map((s) => <StationRow key={s.id} station={s} list={stations} showPlace />)}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
