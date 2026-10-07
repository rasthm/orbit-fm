import { useState } from 'preact/hooks';
import { settings } from '../settings';
import { favorites, panel, playStation, recents } from '../store';
import { hideRec, profile, recs, recsLoading } from '../taste';
import { IconClose, IconEyeOff } from './icons';
import { StationRow } from './StationRow';

type Tab = 'foryou' | 'favorites' | 'recents';

function ForYou() {
  const p = profile.value;
  if (!settings.value.recommendations) {
    return <p class="empty">Recommendations are off. Turn them on in Settings → Discovery.</p>;
  }
  if (!p.ready) {
    const left = p.needed - p.qualifiedCount;
    return (
      <p class="empty">
        Listen to {left} more station{left === 1 ? '' : 's'} for 2+ minutes each and your personal picks will appear
        here and as <span class="red-dot" /> red rings on the globe.
      </p>
    );
  }
  if (recsLoading.value && !recs.value.length) {
    return <div class="sheet-loading"><span class="spinner" /> Reading your taste…</div>;
  }
  if (!recs.value.length) return <p class="empty">No picks yet. Try Settings → Discovery → Refresh.</p>;

  const list = recs.value.map((r) => r.station);
  return (
    <ul class="station-list">
      {recs.value.map((r) => (
        <li key={r.station.id} class="rec-row">
          <button class="rec-main" onClick={() => playStation(r.station, list)}>
            <span class="red-dot" aria-hidden="true" />
            <span class="station-text">
              <span class="station-title">{r.station.title}</span>
              <span class="station-sub">{r.station.placeTitle}, {r.station.country}</span>
              <span class="rec-reason">{r.reason}</span>
            </span>
          </button>
          <button class="icon-btn" aria-label={`Not interested in ${r.station.title}`} title="Not interested" onClick={() => hideRec(r.station)}>
            <IconEyeOff size={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function LibraryPanel() {
  const [tab, setTab] = useState<Tab>(
    recs.value.length ? 'foryou' : favorites.value.length ? 'favorites' : 'recents',
  );
  const list = tab === 'favorites' ? favorites.value : recents.value;

  return (
    <div class="overlay" role="dialog" aria-label="Library" onClick={(e) => e.target === e.currentTarget && (panel.value = 'none')}>
      <div class="sheet library-panel">
        <header class="sheet-head">
          <div class="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'foryou'} class="tab tab-red" onClick={() => setTab('foryou')}>
              For you <small>{recs.value.length || ''}</small>
            </button>
            <button role="tab" aria-selected={tab === 'favorites'} class="tab" onClick={() => setTab('favorites')}>
              Favourites <small>{favorites.value.length}</small>
            </button>
            <button role="tab" aria-selected={tab === 'recents'} class="tab" onClick={() => setTab('recents')}>
              Recent <small>{recents.value.length}</small>
            </button>
          </div>
          <button class="icon-btn" aria-label="Close library" onClick={() => (panel.value = 'none')}>
            <IconClose />
          </button>
        </header>
        <div class="library-body">
          {tab === 'foryou' ? (
            <ForYou />
          ) : (
            <>
              <ul class="station-list">
                {list.map((s) => <StationRow key={s.id} station={s} list={list} showPlace />)}
              </ul>
              {!list.length && (
                <p class="empty">
                  {tab === 'favorites'
                    ? 'Tap the ♥ on any station to save it here. Your first 8 favourites become cue pads on the deck.'
                    : 'Stations you play will show up here.'}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
