import { db } from './db';
import { seriesKey, titleKey } from '../features/reading/series';
import {
  type Book,
  type Bookcase,
  type Room,
  type Row,
  type Shelf,
  type SyncedSettings,
  newId,
  now,
} from './models';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Called after any local write so the sync engine can schedule a batched commit. */
export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function markDirty(): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const row = await db.meta.get('localVersion');
    await db.meta.put({ key: 'localVersion', value: ((row?.value as number) ?? 0) + 1 });
  });
  listeners.forEach((fn) => fn());
}

// ---------- Books ----------

export async function saveBook(book: Book): Promise<Book> {
  const stamped = { ...book, updatedAt: now() };
  await db.books.put(stamped);
  await retirePlaceholders([stamped]);
  await markDirty();
  return stamped;
}

export async function saveBooks(books: Book[]): Promise<void> {
  const t = now();
  const stamped = books.map((b) => ({ ...b, updatedAt: t }));
  await db.books.bulkPut(stamped);
  await retirePlaceholders(stamped);
  await markDirty();
}

const surname = (name: string) => name.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
function sharesAuthor(a: Book, b: Book): boolean {
  if (a.authors.length === 0 || b.authors.length === 0) return true;
  const names = new Set(a.authors.map(surname));
  return b.authors.some((n) => names.has(surname(n)));
}

/**
 * Removes series placeholders that a real book now fills: same series (loosely) and number, or the
 * same title when the placeholder was named after the real book.
 */
async function retirePlaceholders(saved: Book[]): Promise<void> {
  const real = saved.filter((b) => !b.deleted && !b.seriesPlaceholder);
  if (real.length === 0) return;
  const placeholders = (await db.books.toArray()).filter((b) => b.seriesPlaceholder && !b.deleted);
  const filled = placeholders.filter((p) =>
    real.some(
      (b) =>
        (b.series && p.series && b.seriesIndex !== null && seriesKey(b.series) === seriesKey(p.series) && b.seriesIndex === p.seriesIndex) ||
        (titleKey(b.title) === titleKey(p.title) && sharesAuthor(b, p)),
    ),
  );
  if (filled.length === 0) return;
  const t = now();
  await db.books.bulkPut(filled.map((p) => ({ ...p, deleted: true, queue: { inQueue: false, position: null }, updatedAt: t })));
}

export async function deleteBook(id: string): Promise<void> {
  const book = await db.books.get(id);
  if (!book) return;
  await db.books.put({ ...book, deleted: true, updatedAt: now() });
  await db.covers.delete(id);
  await markDirty();
}

export async function liveBooks(): Promise<Book[]> {
  return (await db.books.toArray()).filter((b) => !b.deleted);
}

export async function findBookByIsbn(isbn13: string): Promise<Book | undefined> {
  const matches = await db.books.where('isbn13').equals(isbn13).toArray();
  return matches.find((b) => !b.deleted);
}

export async function moveBooks(ids: string[], shelfId: string | null, row: Row = 'front'): Promise<void> {
  const books = await db.books.bulkGet(ids);
  const updated = books
    .filter((b): b is Book => !!b && !b.deleted)
    .map((b) => ({ ...b, location: shelfId ? { shelfId, row } : null }));
  await saveBooks(updated);
}

// ---------- Locations ----------

export interface Locations {
  rooms: Room[];
  bookcases: Bookcase[];
  shelves: Shelf[];
}

export async function loadLocations(): Promise<Locations> {
  const [rooms, bookcases, shelves] = await Promise.all([
    db.rooms.toArray(),
    db.bookcases.toArray(),
    db.shelves.toArray(),
  ]);
  return {
    rooms: rooms.filter((r) => !r.deleted).sort((a, b) => a.name.localeCompare(b.name)),
    bookcases: bookcases.filter((b) => !b.deleted).sort((a, b) => a.number - b.number),
    shelves: shelves.filter((s) => !s.deleted).sort((a, b) => a.number - b.number),
  };
}

export async function addRoom(name: string, code: string): Promise<Room> {
  const room: Room = { id: newId('rm'), name, code: code.toUpperCase(), updatedAt: now(), deleted: false };
  await db.rooms.put(room);
  await markDirty();
  return room;
}

export async function updateRoom(room: Room): Promise<void> {
  await db.rooms.put({ ...room, code: room.code.toUpperCase(), updatedAt: now() });
  await markDirty();
}

export async function addBookcase(roomId: string, shelfCount: number, hasBackRow: boolean): Promise<Bookcase> {
  const existing = (await db.bookcases.where('roomId').equals(roomId).toArray()).filter((b) => !b.deleted);
  const number = existing.reduce((max, b) => Math.max(max, b.number), 0) + 1;
  const t = now();
  const bookcase: Bookcase = { id: newId('bc'), roomId, number, name: '', updatedAt: t, deleted: false };
  const shelves: Shelf[] = Array.from({ length: shelfCount }, (_, i) => ({
    id: newId('s'),
    bookcaseId: bookcase.id,
    number: i + 1,
    hasBackRow,
    updatedAt: t,
    deleted: false,
  }));
  await db.transaction('rw', db.bookcases, db.shelves, async () => {
    await db.bookcases.put(bookcase);
    await db.shelves.bulkPut(shelves);
  });
  await markDirty();
  return bookcase;
}

/** The Ebooks room, created on first use. Its "bookcases" are the apps or devices ebooks live in. */
export async function ensureEbookRoom(): Promise<Room> {
  const existing = (await db.rooms.toArray()).find((r) => r.ebook && !r.deleted);
  if (existing) return existing;
  const room: Room = { id: newId('rm'), name: 'Ebooks', code: 'EB', ebook: true, updatedAt: now(), deleted: false };
  await db.rooms.put(room);
  await markDirty();
  return room;
}

/** Adds a place ebooks are saved (Kindle, Libby…): a bookcase with a single shelf. */
export async function addEbookPlace(roomId: string, name: string): Promise<{ bookcase: Bookcase; shelf: Shelf }> {
  const existing = (await db.bookcases.where('roomId').equals(roomId).toArray()).filter((b) => !b.deleted);
  const t = now();
  const bookcase: Bookcase = {
    id: newId('bc'),
    roomId,
    number: existing.reduce((max, b) => Math.max(max, b.number), 0) + 1,
    name,
    updatedAt: t,
    deleted: false,
  };
  const shelf: Shelf = { id: newId('s'), bookcaseId: bookcase.id, number: 1, hasBackRow: false, updatedAt: t, deleted: false };
  await db.transaction('rw', db.bookcases, db.shelves, async () => {
    await db.bookcases.put(bookcase);
    await db.shelves.put(shelf);
  });
  await markDirty();
  return { bookcase, shelf };
}

export async function updateBookcase(bookcase: Bookcase): Promise<void> {
  await db.bookcases.put({ ...bookcase, updatedAt: now() });
  await markDirty();
}

export async function addShelf(bookcaseId: string, hasBackRow: boolean): Promise<Shelf> {
  const existing = (await db.shelves.where('bookcaseId').equals(bookcaseId).toArray()).filter((s) => !s.deleted);
  const number = existing.reduce((max, s) => Math.max(max, s.number), 0) + 1;
  const shelf: Shelf = { id: newId('s'), bookcaseId, number, hasBackRow, updatedAt: now(), deleted: false };
  await db.shelves.put(shelf);
  await markDirty();
  return shelf;
}

export async function updateShelf(shelf: Shelf): Promise<void> {
  await db.shelves.put({ ...shelf, updatedAt: now() });
  await markDirty();
}

/** Tombstones the location and everything under it. Books on removed shelves lose their location. */
export async function deleteLocation(kind: 'room' | 'bookcase' | 'shelf', id: string): Promise<void> {
  const t = now();
  const locs = await loadLocations();
  const bookcaseIds =
    kind === 'room' ? locs.bookcases.filter((b) => b.roomId === id).map((b) => b.id) : kind === 'bookcase' ? [id] : [];
  const shelfIds =
    kind === 'shelf' ? [id] : locs.shelves.filter((s) => bookcaseIds.includes(s.bookcaseId)).map((s) => s.id);

  await db.transaction('rw', [db.rooms, db.bookcases, db.shelves, db.books], async () => {
    if (kind === 'room') {
      const room = await db.rooms.get(id);
      if (room) await db.rooms.put({ ...room, deleted: true, updatedAt: t });
    }
    for (const bcId of bookcaseIds) {
      const bc = await db.bookcases.get(bcId);
      if (bc) await db.bookcases.put({ ...bc, deleted: true, updatedAt: t });
    }
    for (const sId of shelfIds) {
      const s = await db.shelves.get(sId);
      if (s) await db.shelves.put({ ...s, deleted: true, updatedAt: t });
    }
    const books = await db.books.toArray();
    for (const b of books) {
      if (b.location && shelfIds.includes(b.location.shelfId)) {
        await db.books.put({ ...b, location: null, updatedAt: t });
      }
    }
  });
  await markDirty();
}

// ---------- Settings ----------

export const DEFAULT_SETTINGS: SyncedSettings = {
  id: 'settings',
  defaultWordsPerPage: 275,
  upNextShelfId: null,
  upNextAutoMove: false,
  defaultWordsPerMinute: 155,
  partnerName: 'Partner',
  updatedAt: '1970-01-01T00:00:00.000Z',
  deleted: false,
};

export async function loadSettings(): Promise<SyncedSettings> {
  // Spread over the defaults so settings written by older builds pick up new fields.
  return { ...DEFAULT_SETTINGS, ...(await db.settings.get('settings')) };
}

export async function saveSettings(settings: SyncedSettings): Promise<void> {
  await db.settings.put({ ...settings, id: 'settings', updatedAt: now() });
  await markDirty();
}
