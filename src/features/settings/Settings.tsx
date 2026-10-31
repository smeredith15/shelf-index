import { useEffect, useRef, useState } from 'preact/hooks';
import { withSeriesFromWikidata } from '../../lookup/wikidata';
import { Field } from '../../app/ui';
import { setMeta } from '../../data/db';
import { useLive } from '../../data/hooks';
import { liveBooks, loadSettings, saveBook, saveSettings } from '../../data/store';
import { type SyncConfig, loadConfig, saveConfig } from '../../sync/github';
import { syncNow } from '../../sync/scheduler';
import { useSyncState } from '../../app/SyncIndicator';
import { FORMAT_LABELS, type Format } from '../../data/models';
import { LocationPicker } from '../locations/LocationPicker';
import { LocationsEditor } from '../locations/LocationsEditor';
import { MIN_CALIBRATION_BOOKS } from '../reading/logic';
import { useCalibration } from '../reading/useCalibration';

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
      <section id="lookups" class="card">
        <h2>Book lookups</h2>
        <LookupSettings />
        <FillSeries />
      </section>
      <section id="readers" class="card">
        <h2>Readers</h2>
        <ReadersSettings />
      </section>
      <section id="upnext" class="card">
        <h2>Up Next</h2>
        <UpNextSettings />
      </section>
      <section id="reading" class="card">
        <h2>Word counts</h2>
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

/** One pass over books with no series, filling in what Wikidata knows. */
function FillSeries() {
  const books = useLive(liveBooks);
  const [run, setRun] = useState<{ done: number; total: number; found: number; stopped: boolean } | null>(null);
  const stop = useRef(false);
  if (!books) return null;
  const missing = books.filter((b) => !b.series && !b.seriesPlaceholder && b.title.trim());

  const start = async () => {
    stop.current = false;
    let found = 0;
    setRun({ done: 0, total: missing.length, found, stopped: false });
    for (let i = 0; i < missing.length; i++) {
      if (stop.current) break;
      const book = missing[i];
      const filled = await withSeriesFromWikidata(book, 10000);
      if (filled.series) {
        found++;
        await saveBook(filled);
      }
      setRun({ done: i + 1, total: missing.length, found, stopped: false });
    }
    setRun((r) => (r ? { ...r, stopped: stop.current } : r));
  };

  return (
    <div class="fill-series">
      <h3>Series details</h3>
      <p class="muted">
        Series and numbers drive the series pages and putting the next book on To Read. Wikidata knows them for many
        well-known series.
      </p>
      {run && (
        <p class="notice">
          {run.done < run.total && !run.stopped ? 'Checking' : run.stopped ? 'Stopped after' : 'Checked'} {run.done} of{' '}
          {run.total} books · found the series for {run.found}.
        </p>
      )}
      <div class="form-actions">
        {run && run.done < run.total && !run.stopped ? (
          <button onClick={() => (stop.current = true)}>Stop</button>
        ) : (
          <button disabled={missing.length === 0} onClick={start}>
            {missing.length ? `Fill in series for ${missing.length} book${missing.length === 1 ? '' : 's'}` : 'Every book has a series'}
          </button>
        )}
      </div>
    </div>
  );
}

function LookupSettings() {
  const settings = useLive(loadSettings);
  const [key, setKey] = useState<string | null>(null);
  if (!settings) return null;
  const value = key ?? settings.googleBooksKey ?? '';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void saveSettings({ ...settings, googleBooksKey: value.trim() || undefined });
        setKey(null);
      }}
    >
      <p class="muted">
        Books are looked up in Open Library and Google Books. Without a key, Google shares one free daily quota among everyone
        using it anonymously, and when that runs out searches quietly miss books. A free key of your own avoids that.
      </p>
      <details class="howto">
        <summary>How to get a free Google Books API key</summary>
        <ol>
          <li>
            Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a> and
            create a project (any name).
          </li>
          <li>
            Open <em>APIs &amp; Services → Library</em>, search for <em>Books API</em> and click <em>Enable</em>.
          </li>
          <li>
            Open <em>APIs &amp; Services → Credentials → Create credentials → API key</em>.
          </li>
          <li>
            Edit the key: under <em>Application restrictions</em> choose <em>Websites</em> and add{' '}
            <code>https://shelf-index.pages.dev/*</code>; under <em>API restrictions</em> choose <em>Books API</em>. Save.
          </li>
          <li>Paste the key below. It's saved in your private data repo, so every device uses it.</li>
        </ol>
      </details>
      <Field label="Google Books API key" hint={settings.googleBooksKey ? 'A key is saved.' : 'Optional'}>
        <input value={value} autoComplete="off" autoCapitalize="off" placeholder="AIza…" onInput={(e) => setKey(e.currentTarget.value)} />
      </Field>
      <div class="form-actions">
        <button class="primary" disabled={key === null}>
          Save key
        </button>
      </div>
    </form>
  );
}

function ReadersSettings() {
  const settings = useLive(loadSettings);
  if (!settings) return null;
  return (
    <>
      <p class="muted">
        Covers show a <span class="dot-key dot-me" /> green dot for books you've read and a <span class="dot-key dot-partner" /> blue
        dot for books the other reader has read. Mark those on a book's page, or select several in the library.
      </p>
      <Field label="Name for the blue dot">
        <input
          value={settings.partnerName}
          placeholder="Partner"
          onChange={(e) => saveSettings({ ...settings, partnerName: e.currentTarget.value.trim() || 'Partner' })}
        />
      </Field>
    </>
  );
}

function UpNextSettings() {
  const settings = useLive(loadSettings);
  if (!settings) return null;
  return (
    <>
      <p class="muted">Your physical Up Next shelf is an ordinary location. Pick it here.</p>
      <LocationPicker
        value={settings.upNextShelfId ? { shelfId: settings.upNextShelfId, row: 'front' } : null}
        onChange={(loc) => saveSettings({ ...settings, upNextShelfId: loc?.shelfId ?? null })}
      />
      <label class="check">
        <input
          type="checkbox"
          checked={settings.upNextAutoMove}
          disabled={!settings.upNextShelfId}
          onChange={(e) => saveSettings({ ...settings, upNextAutoMove: e.currentTarget.checked })}
        />
        Move books to this shelf when they join the queue
      </label>
    </>
  );
}

function ReadingSettings() {
  const settings = useLive(loadSettings);
  const calibration = useCalibration();
  if (!settings || !calibration) return null;
  return (
    <>
      <Field label="Default words per page" hint="Used for estimates until you have enough counted books.">
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
      <Field label="Default narration speed (words per minute)" hint="Used for audiobook estimates until 3 counted books have audiobook lengths.">
        <input
          type="number"
          min={80}
          max={300}
          value={settings.defaultWordsPerMinute}
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            if (v >= 80 && v <= 300) void saveSettings({ ...settings, defaultWordsPerMinute: v });
          }}
        />
      </Field>
      <table class="calibration">
        <thead>
          <tr>
            <th>Format</th>
            <th>Words/page</th>
            <th>Based on</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(FORMAT_LABELS) as Format[]).map((f) => {
            const c = calibration.pages[f];
            return (
              <tr key={f}>
                <td>{FORMAT_LABELS[f]}</td>
                <td>{c.wordsPerPage}</td>
                <td class="muted">
                  {c.basis === 'own' ? `${c.books} of your books` : c.basis === 'all' ? `all ${c.books} counted books` : 'default'}
                </td>
              </tr>
            );
          })}
          <tr>
            <td>Audiobooks</td>
            <td>{calibration.audio.wordsPerMinute}/min</td>
            <td class="muted">
              {calibration.audio.basis === 'own' ? `${calibration.audio.books} of your books` : 'default'}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="tiny muted">
        A format gets its own figure once {MIN_CALIBRATION_BOOKS} books of that format have looked-up or sampled counts; audiobooks once {MIN_CALIBRATION_BOOKS} counted books have audiobook lengths.
      </p>
    </>
  );
}
