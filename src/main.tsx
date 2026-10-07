import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import './styles.css';
import './features.css';

render(<App />, document.getElementById('app')!);

// Pick up new deploys without a second manual reload: when the new service worker takes over,
// the page reloads itself; also check for updates every hour for long-running installed apps.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
  },
});
