import { render } from 'preact';
import { App } from './app';
import './styles.css';
import './features.css';

render(<App />, document.getElementById('app')!);
