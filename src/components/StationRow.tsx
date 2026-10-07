import type { Station } from '../api';
import { current, isFavorite, playStation, status, toggleFavorite } from '../store';
import { IconHeart, IconHeartFill } from './icons';

type Props = { station: Station; list?: Station[]; showPlace?: boolean };

export function StationRow({ station, list, showPlace }: Props) {
  const active = current.value?.id === station.id;
  const fav = isFavorite(station.id);
  return (
    <li class={`station-row${active ? ' is-active' : ''}`}>
      <button class="station-main" onClick={() => playStation(station, list)}>
        <span class={`eq${active && status.value === 'playing' ? ' is-on' : ''}`} aria-hidden="true">
          <i /><i /><i />
        </span>
        <span class="station-text">
          <span class="station-title">{station.title}</span>
          {showPlace && (
            <span class="station-sub">{station.placeTitle}, {station.country}</span>
          )}
        </span>
      </button>
      <button
        class={`icon-btn fav${fav ? ' is-on' : ''}`}
        aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
        aria-pressed={fav}
        onClick={() => toggleFavorite(station)}
      >
        {fav ? <IconHeartFill size={18} /> : <IconHeart size={18} />}
      </button>
    </li>
  );
}
