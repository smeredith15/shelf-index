import { useEffect, useState } from 'preact/hooks';
import { type SyncState } from '../sync/sync';
import { getSyncState, subscribeSync, syncNow } from '../sync/scheduler';

export function useSyncState(): SyncState {
  const [state, setState] = useState(getSyncState);
  useEffect(() => subscribeSync(setState), []);
  return state;
}

const LABELS: Record<SyncState['kind'], string> = {
  off: 'Sync off',
  idle: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline',
  error: 'Sync error',
};

export function SyncIndicator() {
  const state = useSyncState();
  return (
    <button
      class={`sync-dot sync-${state.kind}`}
      title={state.kind === 'error' ? state.message : LABELS[state.kind]}
      onClick={() => (state.kind === 'off' || state.kind === 'error' ? (location.hash = '#/settings/sync') : void syncNow())}
    >
      <span class="dot" />
      <span class="sync-label">{LABELS[state.kind]}</span>
    </button>
  );
}
