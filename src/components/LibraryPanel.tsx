import { useState } from 'preact/hooks';
import { favorites, panel, recents } from '../store';
import { IconClose } from './icons';
import { StationRow } from './StationRow';

export function LibraryPanel() {
  const [tab, setTab] = useState<'favorites' | 'recents'>(favorites.value.length ? 'favorites' : 'recents');
  const list = tab === 'favorites' ? favorites.value : recents.value;

  return (
    <div class="overlay" role="dialog" aria-label="Library" onClick={(e) => e.target === e.currentTarget && (panel.value = 'none')}>
      <div class="sheet library-panel">
        <header class="sheet-head">
          <div class="tabs" role="tablist">
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
      </div>
    </div>
  );
}
