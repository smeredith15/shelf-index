import { getMeta } from '../data/db';
import { onLocalChange } from '../data/store';
import { GitHubError, loadConfig } from './github';
import { type SyncState, runSync } from './sync';

const IDLE_DELAY_MS = 4000;
const POLL_MS = 5 * 60 * 1000;

let state: SyncState = { kind: 'off' };
const listeners = new Set<(s: SyncState) => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
let rerun = false;

function setState(next: SyncState) {
  state = next;
  listeners.forEach((fn) => fn(state));
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function syncNow(): Promise<void> {
  clearTimeout(timer);
  if (!loadConfig()) {
    setState({ kind: 'off' });
    return;
  }
  if (running) {
    rerun = true;
    return running;
  }
  if (!navigator.onLine) {
    setState({ kind: 'offline' });
    return;
  }
  setState({ kind: 'syncing' });
  running = (async () => {
    try {
      await runSync();
      setState({ kind: 'idle', lastSync: await getMeta<string | null>('lastSyncAt', null) });
    } catch (err) {
      console.error('Sync failed', err);
      const auth = err instanceof GitHubError && (err.status === 401 || err.status === 403);
      const message = auth
        ? 'GitHub rejected the token. It may have expired: enter a new one in Settings → Sync.'
        : err instanceof Error
          ? err.message
          : String(err);
      setState({ kind: 'error', message, auth });
    } finally {
      running = null;
      if (rerun) {
        rerun = false;
        void syncNow();
      }
    }
  })();
  return running;
}

/** Commits after a short idle delay, when the app goes to the background, and periodically. */
export function startSyncScheduler(): void {
  onLocalChange(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), IDLE_DELAY_MS);
  });
  // Going to the background flushes pending edits; coming back picks up other devices' changes.
  document.addEventListener('visibilitychange', () => void syncNow());
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => setState({ kind: 'offline' }));
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, POLL_MS);
  void syncNow();
}
