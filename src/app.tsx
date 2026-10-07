import { useEffect, useState } from 'preact/hooks';
import { Globe } from './components/Globe';
import { IconLibrary, IconSearch } from './components/icons';
import { LibraryPanel } from './components/LibraryPanel';
import { PlacePanel } from './components/PlacePanel';
import { PlayerDeck } from './components/PlayerDeck';
import { SearchPanel } from './components/SearchPanel';
import {
  closePlace, deckOpen, loadPlaces, panel, places, placesError, scan, selectedPlace, step, togglePlay,
} from './store';

type InstallEvent = Event & { prompt: () => Promise<void> };

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

function InstallButton() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (isStandalone() || (!evt && !isIOS)) return null;
  return (
    <>
      <button
        class="pill"
        onClick={() => (evt ? evt.prompt().then(() => setEvt(null)) : setHint((h) => !h))}
      >
        Install
      </button>
      {hint && (
        <div class="toast" onClick={() => setHint(false)}>
          Tap <b>Share</b> → <b>Add to Home Screen</b> to install ORBIT.FM
        </div>
      )}
    </>
  );
}

function TopBar() {
  return (
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true" />
        <span class="brand-name">ORBIT<em>.FM</em></span>
      </div>
      <div class="topbar-actions">
        <InstallButton />
        <button class="icon-btn glass" aria-label="Search (/)" onClick={() => (panel.value = 'search')}>
          <IconSearch />
        </button>
        <button class="icon-btn glass" aria-label="Library" onClick={() => (panel.value = 'library')}>
          <IconLibrary />
        </button>
      </div>
    </header>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (t?.closest?.('input, textarea, [role="slider"]')) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case '/':
          e.preventDefault();
          panel.value = 'search';
          break;
        case 'n': step(1); break;
        case 'p': step(-1); break;
        case 'r': void scan(); break;
        case 'Escape':
          if (panel.value !== 'none') panel.value = 'none';
          else if (deckOpen.value) deckOpen.value = false;
          else if (selectedPlace.value) closePlace();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  useEffect(() => void loadPlaces(), []);
  useShortcuts();

  return (
    <div class={`app${deckOpen.value ? ' deck-open' : ''}`}>
      <Globe />
      <div class="vignette" aria-hidden="true" />
      <div class="scanlines" aria-hidden="true" />
      <TopBar />

      {!places.value.length && !placesError.value && (
        <div class="boot"><span class="spinner" /> Mapping 38,000 stations…</div>
      )}
      {placesError.value && (
        <div class="boot boot-error">
          Can't reach the station network.
          <button class="pill" onClick={() => void loadPlaces()}>Retry</button>
        </div>
      )}

      <PlacePanel />
      <div class="player-dock"><PlayerDeck /></div>

      {panel.value === 'search' && <SearchPanel />}
      {panel.value === 'library' && <LibraryPanel />}
    </div>
  );
}
