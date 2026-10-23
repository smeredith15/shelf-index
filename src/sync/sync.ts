import type { Table } from 'dexie';
import { db, getMeta, setMeta } from '../data/db';
import type { Book, CoverBlob, Session, Syncable, SyncedSettings } from '../data/models';
import { DEFAULT_SETTINGS } from '../data/store';
import {
  PATHS,
  coverPath,
  parseList,
  parseLocations,
  parseSettings,
  serializeList,
  serializeLocations,
  serializeSettings,
} from './files';
import { GitHubClient, GitHubError, type TreeEntry, blobToBase64, loadConfig } from './github';
import { mergeRecords } from './merge';

export type SyncState =
  | { kind: 'off' }
  | { kind: 'idle'; lastSync: string | null }
  | { kind: 'syncing' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string; auth: boolean };

const MAX_ATTEMPTS = 4;

/**
 * One sync round: pull the data repo if it moved, merge it into IndexedDB (newer updatedAt wins),
 * then push everything local as a single commit. Retries when another device pushed in between.
 */
export async function runSync(): Promise<void> {
  const config = loadConfig();
  if (!config) return;
  const gh = new GitHubClient(config);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const versionAtStart = await getMeta<number>('localVersion', 0);
    const syncedVersion = await getMeta<number>('syncedVersion', 0);
    const lastSha = await getMeta<string | null>('lastSha', null);

    let head: { commit: string; tree: string };
    try {
      head = await gh.head();
    } catch (err) {
      if (err instanceof GitHubError && (err.status === 409 || err.status === 404)) {
        throw new GitHubError(
          'The data repo is empty or missing. Create it on GitHub with a README so it has a default branch.',
          err.status,
        );
      }
      throw err;
    }

    if (head.commit !== lastSha) {
      await pull(gh, head.commit);
      await setMeta('lastSha', head.commit);
    }

    // Skip covers for books that were never saved (e.g. a photo taken and then cancelled).
    const pendingCovers: CoverBlob[] = [];
    for (const c of await db.covers.toArray()) {
      const book = c.synced ? null : await db.books.get(c.bookId);
      if (book && !book.deleted) pendingCovers.push(c);
    }
    if (versionAtStart === syncedVersion && pendingCovers.length === 0) {
      await setMeta('lastSyncAt', new Date().toISOString());
      return;
    }

    const entries: TreeEntry[] = [
      { path: PATHS.books, mode: '100644', type: 'blob', content: serializeList(await sorted(db.books)) },
      { path: PATHS.sessions, mode: '100644', type: 'blob', content: serializeList(await sorted(db.sessions)) },
      {
        path: PATHS.locations,
        mode: '100644',
        type: 'blob',
        content: serializeLocations({
          rooms: await sorted(db.rooms),
          bookcases: await sorted(db.bookcases),
          shelves: await sorted(db.shelves),
        }),
      },
      {
        path: PATHS.settings,
        mode: '100644',
        type: 'blob',
        content: serializeSettings((await db.settings.get('settings')) ?? DEFAULT_SETTINGS),
      },
    ];
    for (const cover of pendingCovers) {
      const sha = await gh.createBlob(await blobToBase64(cover.blob));
      entries.push({ path: coverPath(cover.bookId), mode: '100644', type: 'blob', sha });
    }

    const tree = await gh.createTree(head.tree, entries);
    let newHead = head.commit;
    if (tree !== head.tree) {
      const commit = await gh.createCommit(commitMessage(pendingCovers.length), tree, head.commit);
      if (!(await gh.updateRef(commit))) continue; // Branch moved: pull, merge and try again.
      newHead = commit;
    }

    await db.transaction('rw', db.covers, db.meta, async () => {
      for (const cover of pendingCovers) {
        const current = await db.covers.get(cover.bookId);
        if (current && current.rev === cover.rev) await db.covers.put({ ...current, synced: true });
      }
      await setMeta('lastSha', newHead);
      await setMeta('syncedVersion', versionAtStart);
      await setMeta('lastSyncAt', new Date().toISOString());
    });
    return;
  }
  throw new Error('The data repo kept changing during sync. Try again in a moment.');
}

async function sorted<T extends Syncable>(table: Table<T, string>): Promise<T[]> {
  const rows = await table.toArray();
  return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function commitMessage(coverCount: number): string {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const covers = coverCount ? `, ${coverCount} cover${coverCount === 1 ? '' : 's'}` : '';
  return `Sync ${stamp} UTC${covers}`;
}

async function pull(gh: GitHubClient, ref: string): Promise<void> {
  const [booksText, sessionsText, locationsText, settingsText] = await Promise.all([
    gh.readText(PATHS.books, ref),
    gh.readText(PATHS.sessions, ref),
    gh.readText(PATHS.locations, ref),
    gh.readText(PATHS.settings, ref),
  ]);
  const remoteLocations = parseLocations(locationsText);
  const remoteSettings = parseSettings(settingsText);

  await db.transaction(
    'rw',
    [db.books, db.sessions, db.rooms, db.bookcases, db.shelves, db.settings, db.covers],
    async () => {
      const books = mergeRecords(await db.books.toArray(), parseList<Book>(booksText));
      await db.books.bulkPut(books.toLocal);
      // A newer remote record may point at a replaced cover; drop the cached copy so it refetches.
      for (const book of books.toLocal) {
        const cached = await db.covers.get(book.id);
        if (cached?.synced) await db.covers.delete(book.id);
      }

      await db.sessions.bulkPut(mergeRecords(await db.sessions.toArray(), parseList<Session>(sessionsText)).toLocal);
      await db.rooms.bulkPut(mergeRecords(await db.rooms.toArray(), remoteLocations.rooms).toLocal);
      await db.bookcases.bulkPut(mergeRecords(await db.bookcases.toArray(), remoteLocations.bookcases).toLocal);
      await db.shelves.bulkPut(mergeRecords(await db.shelves.toArray(), remoteLocations.shelves).toLocal);
      if (remoteSettings) {
        const local = await db.settings.toArray();
        await db.settings.bulkPut(mergeRecords<SyncedSettings>(local, [remoteSettings]).toLocal);
      }
    },
  );
}

/** Fetches a cover image from the data repo and caches it locally. */
export async function fetchCover(bookId: string, path: string): Promise<Blob | null> {
  const config = loadConfig();
  if (!config) return null;
  const gh = new GitHubClient(config);
  const ref = (await getMeta<string | null>('lastSha', null)) ?? (await gh.defaultBranch());
  const blob = await gh.readBlob(path, ref);
  if (blob && blob.size > 0) {
    await db.covers.put({ bookId, blob, rev: `remote-${ref}`, synced: true });
  }
  return blob;
}
