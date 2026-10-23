import { useEffect, useState } from 'preact/hooks';
import { Field } from '../../app/ui';
import { setMeta } from '../../data/db';
import { useLive } from '../../data/hooks';
import { loadSettings, saveSettings } from '../../data/store';
import { type SyncConfig, loadConfig, saveConfig } from '../../sync/github';
import { syncNow } from '../../sync/scheduler';
import { useSyncState } from '../../app/SyncIndicator';
import { LocationsEditor } from '../locations/LocationsEditor';

export function Settings({ section }: { section?: string }) {
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView();
  }, [section]);

  return (
    <div class="page">
      <h1>Settings</h1>
      <section id="sync" class="card">
        <h2>Sync</h2>
        <SyncSettings />
      </section>
      <section id="locations" class="card">
        <h2>Locations</h2>
        <LocationsEditor />
      </section>
      <section id="reading" class="card">
        <h2>Reading</h2>
        <ReadingSettings />
      </section>
      <p class="tiny muted center">Shelf Index · build {__BUILD_TIME__}</p>
    </div>
  );
}

function SyncSettings() {
  const existing = loadConfig();
  const [owner, setOwner] = useState(existing?.owner ?? '');
  const [repo, setRepo] = useState(existing?.repo ?? 'shelf-index-data');
  const [token, setToken] = useState('');
  const state = useSyncState();

  const save = async (e: Event) => {
    e.preventDefault();
    const next: SyncConfig = {
      owner: owner.trim(),
      repo: repo.trim(),
      token: token.trim() || existing?.token || '',
    };
    if (!next.owner || !next.repo || !next.token) return;
    const repoChanged = existing?.owner !== next.owner || existing?.repo !== next.repo;
    saveConfig(next);
    if (repoChanged) {
      // A different data repo: pull it fresh and push anything this device has.
      await setMeta('lastSha', null);
      await setMeta('syncedVersion', 0);
    }
    setToken('');
    await syncNow();
  };

  return (
    <form onSubmit={save}>
      <p class="muted">
        Library data is committed to a private GitHub repo. Use a fine-grained token limited to that repo with{' '}
        <em>Contents: read and write</em>. The token is stored only on this device.
      </p>
      <div class="row-2">
        <Field label="Repo owner">
          <input value={owner} autoCapitalize="off" autoCorrect="off" onInput={(e) => setOwner(e.currentTarget.value)} />
        </Field>
        <Field label="Repo name">
          <input value={repo} autoCapitalize="off" autoCorrect="off" onInput={(e) => setRepo(e.currentTarget.value)} />
        </Field>
      </div>
      <Field label="Access token" hint={existing ? 'Leave blank to keep the current token.' : undefined}>
        <input
          type="password"
          value={token}
          placeholder={existing ? '••••••••' : 'github_pat_…'}
          autoComplete="off"
          onInput={(e) => setToken(e.currentTarget.value)}
        />
      </Field>
      <div class="sync-status">
        {state.kind === 'off' && <span class="muted">Not connected. Everything stays on this device until you connect.</span>}
        {state.kind === 'syncing' && <span>Syncing…</span>}
        {state.kind === 'offline' && <span class="muted">Offline. Changes will sync when you're back online.</span>}
        {state.kind === 'idle' && (
          <span class="ok">Synced{state.lastSync ? ` ${new Date(state.lastSync).toLocaleString()}` : ''}</span>
        )}
        {state.kind === 'error' && <span class="error">{state.message}</span>}
      </div>
      <div class="form-actions">
        {existing && (
          <button
            type="button"
            onClick={() => {
              if (!confirm('Disconnect sync on this device? Local data is kept.')) return;
              saveConfig(null);
              void syncNow();
            }}
          >
            Disconnect
          </button>
        )}
        {existing && (
          <button type="button" onClick={() => syncNow()}>
            Sync now
          </button>
        )}
        <button class="primary">{existing ? 'Save' : 'Connect'}</button>
      </div>
    </form>
  );
}

function ReadingSettings() {
  const settings = useLive(loadSettings);
  if (!settings) return null;
  return (
    <Field label="Default words per page" hint="Used to estimate word counts until you have enough sampled books.">
      <input
        type="number"
        min={50}
        max={1000}
        value={settings.defaultWordsPerPage}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          if (v >= 50 && v <= 1000) void saveSettings({ ...settings, defaultWordsPerPage: v });
        }}
      />
    </Field>
  );
}
