import { useEffect, useState } from 'preact/hooks';
import { closePlace, placeLoading, placesById, selectedPlace } from '../store';
import { dayPhase } from '../sun';
import { IconClose, IconMoon, IconSun } from './icons';
import { StationRow } from './StationRow';

function localTime(utcOffsetMin: number) {
  const now = new Date(Date.now() + (utcOffsetMin + new Date().getTimezoneOffset()) * 60_000);
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function PlacePanel() {
  const place = selectedPlace.value;
  const [filter, setFilter] = useState('');
  const [, tick] = useState(0);

  useEffect(() => setFilter(''), [place?.id]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!place && !placeLoading.value) return null;
  if (!place) {
    return (
      <aside class="sheet place-panel">
        <div class="sheet-loading"><span class="spinner" /> Tuning in…</div>
      </aside>
    );
  }

  const geo = placesById.value.get(place.id);
  const country = geo?.country ?? place.stations[0]?.country ?? '';
  const sky = geo ? dayPhase(geo) : null;
  const q = filter.trim().toLowerCase();
  const list = q ? place.stations.filter((s) => s.title.toLowerCase().includes(q)) : place.stations;

  return (
    <aside class="sheet place-panel" aria-label={`Stations in ${place.title}`}>
      <div class="sheet-grip" aria-hidden="true" />
      <header class="sheet-head">
        <div>
          <p class="kicker">
            {country} · {localTime(place.utcOffset)} local
            {sky && (
              <span class={`sky sky-${sky.phase}`} title={sky.phase === 'day' ? 'Daytime there' : sky.phase === 'twilight' ? 'Twilight there' : 'Night-time there'}>
                {sky.phase === 'day' ? <IconSun size={13} /> : <IconMoon size={13} />}
              </span>
            )}
          </p>
          <h2 class="sheet-title">{place.title}</h2>
          <p class="sheet-meta">{place.stations.length} live station{place.stations.length === 1 ? '' : 's'}</p>
        </div>
        <button class="icon-btn" aria-label="Close" onClick={closePlace}>
          <IconClose />
        </button>
      </header>
      {place.stations.length > 8 && (
        <input
          class="field"
          type="search"
          placeholder="Filter stations…"
          value={filter}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
        />
      )}
      <ul class="station-list">
        {list.map((s) => (
          <StationRow key={s.id} station={s} list={place.stations} />
        ))}
        {!list.length && <li class="empty">No match.</li>}
      </ul>
    </aside>
  );
}
