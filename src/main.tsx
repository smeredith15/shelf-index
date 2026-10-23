import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { startSyncScheduler } from './sync/scheduler';
import './styles.css';

registerSW({ immediate: true });

// Ask the browser not to evict the library under storage pressure.
void navigator.storage?.persist?.();

startSyncScheduler();
render(<App />, document.getElementById('app')!);
