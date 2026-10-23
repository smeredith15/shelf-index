import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getMeta } from '../data/db';
import { blankBook } from '../data/models';
import { addBookcase, addRoom, saveBook } from '../data/store';
import { runSync } from './sync';

/** Minimal in-memory stand-in for the parts of the GitHub API the sync engine uses. */
class FakeGitHub {
  commits = new Map<string, { tree: string; parent: string | null }>();
  trees = new Map<string, Map<string, string>>();
  blobs = new Map<string, string>();
  head = '';
  private n = 0;
  /** Lets a test simulate another device pushing between our read and our write. */
  beforeUpdateRef: (() => void) | null = null;

  constructor() {
    this.trees.set('t0', new Map([['README.md', '# data']]));
    this.commits.set('c0', { tree: 't0', parent: null });
    this.head = 'c0';
  }

  files(commit = this.head) {
    return this.trees.get(this.commits.get(commit)!.tree)!;
  }

  /** Writes files directly, as another device would. */
  commitFiles(changes: Record<string, string>) {
    const tree = new Map(this.files());
    for (const [k, v] of Object.entries(changes)) tree.set(k, v);
    const t = `t${++this.n}`;
    const c = `c${this.n}`;
    this.trees.set(t, tree);
    this.commits.set(c, { tree: t, parent: this.head });
    this.head = c;
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/repos/me/data', '');
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

    if (method === 'GET' && path === '') return json({ default_branch: 'main' });
    if (method === 'GET' && path === '/git/ref/heads/main') return json({ object: { sha: this.head } });
    if (method === 'GET' && path.startsWith('/git/commits/')) {
      const c = this.commits.get(path.split('/').pop()!);
      return c ? json({ tree: { sha: c.tree } }) : json({}, 404);
    }
    if (method === 'GET' && path.startsWith('/contents/')) {
      const file = this.files(url.searchParams.get('ref')!).get(path.slice('/contents/'.length));
      return file === undefined ? new Response('', { status: 404 }) : new Response(file);
    }
    if (method === 'POST' && path === '/git/blobs') {
      const sha = `blob${++this.n}`;
      this.blobs.set(sha, atob(body.content));
      return json({ sha });
    }
    if (method === 'POST' && path === '/git/trees') {
      const tree = new Map(this.trees.get(body.base_tree)!);
      for (const e of body.tree) tree.set(e.path, e.content ?? this.blobs.get(e.sha)!);
      // Content-addressed, like git: identical trees share a sha.
      const key = JSON.stringify([...tree].sort());
      for (const [sha, t] of this.trees) if (JSON.stringify([...t].sort()) === key) return json({ sha });
      const sha = `t${++this.n}`;
      this.trees.set(sha, tree);
      return json({ sha });
    }
    if (method === 'POST' && path === '/git/commits') {
      const sha = `c${++this.n}`;
      this.commits.set(sha, { tree: body.tree, parent: body.parents[0] });
      return json({ sha });
    }
    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      this.beforeUpdateRef?.();
      this.beforeUpdateRef = null;
      if (this.commits.get(body.sha)!.parent !== this.head) return json({ message: 'Update is not a fast forward' }, 422);
      this.head = body.sha;
      return json({});
    }
    throw new Error(`Unhandled ${method} ${path}`);
  };
}

let gh: FakeGitHub;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  gh = new FakeGitHub();
  vi.stubGlobal('fetch', gh.fetch);
  const store = new Map([['shelf-index.sync', JSON.stringify({ owner: 'me', repo: 'data', token: 't' })]]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
});

const remoteBooks = () => JSON.parse(gh.files().get('data/books.json') ?? '[]') as { id: string; title: string }[];

describe('runSync', () => {
  it('creates the data files on first sync and commits once', async () => {
    await saveBook(blankBook({ id: 'b1', title: 'Dune' }));
    const room = await addRoom('Living Room', 'lr');
    await addBookcase(room.id, 3, false);
    await runSync();

    expect(remoteBooks().map((b) => b.title)).toEqual(['Dune']);
    const locations = JSON.parse(gh.files().get('data/locations.json')!);
    expect(locations.rooms[0].code).toBe('LR');
    expect(locations.shelves).toHaveLength(3);
    expect(gh.files().get('README.md')).toBe('# data');
    expect(gh.commits.get(gh.head)!.parent).toBe('c0');
    expect(await getMeta('lastSha', null)).toBe(gh.head);
  });

  it('does not commit when nothing changed', async () => {
    await saveBook(blankBook({ id: 'b1', title: 'Dune' }));
    await runSync();
    const head = gh.head;
    await runSync();
    expect(gh.head).toBe(head);
  });

  it('pulls records added by another device', async () => {
    const other = blankBook({ id: 'b2', title: 'Emma', updatedAt: '2026-10-01T00:00:00.000Z' });
    gh.commitFiles({ 'data/books.json': JSON.stringify([other]) });
    await runSync();
    expect((await db.books.get('b2'))?.title).toBe('Emma');
    // Pulling alone shouldn't create a commit.
    expect(gh.commits.size).toBe(2);
  });

  it('merges when another device pushes mid-sync, newest edit winning', async () => {
    await saveBook(blankBook({ id: 'b1', title: 'Dune' }));
    await runSync();

    // This device edits b1; meanwhile another device adds b2 and pushes first.
    const b1 = (await db.books.get('b1'))!;
    await saveBook({ ...b1, title: 'Dune (local edit)' });
    gh.beforeUpdateRef = () => {
      const remote = remoteBooks();
      remote.push(blankBook({ id: 'b2', title: 'Emma', updatedAt: new Date().toISOString() }));
      gh.commitFiles({ 'data/books.json': JSON.stringify(remote) });
    };
    await runSync();

    expect(remoteBooks().map((b) => b.title).sort()).toEqual(['Dune (local edit)', 'Emma']);
    expect((await db.books.get('b2'))?.title).toBe('Emma');
  });

  it('lets a newer remote edit replace an older local one', async () => {
    await saveBook(blankBook({ id: 'b1', title: 'Old' }));
    await runSync();
    const newer = { ...(await db.books.get('b1'))!, title: 'New', updatedAt: '2999-01-01T00:00:00.000Z' };
    gh.commitFiles({ 'data/books.json': JSON.stringify([newer]) });
    await runSync();
    expect((await db.books.get('b1'))?.title).toBe('New');
  });

  it('uploads pending covers for saved books only', async () => {
    await saveBook(blankBook({ id: 'b1', title: 'Dune', cover: 'covers/b1.jpg' }));
    await db.covers.put({ bookId: 'b1', blob: new Blob(['jpeg-bytes']), rev: '1', synced: false });
    await db.covers.put({ bookId: 'ghost', blob: new Blob(['x']), rev: '1', synced: false });
    await runSync();
    expect(gh.files().get('covers/b1.jpg')).toBe('jpeg-bytes');
    expect(gh.files().has('covers/ghost.jpg')).toBe(false);
    expect((await db.covers.get('b1'))?.synced).toBe(true);
  });
});
