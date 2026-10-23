import Dexie, { type Table } from 'dexie';
import type { Book, Bookcase, CoverBlob, Room, Session, Shelf, SyncedSettings } from './models';

export interface MetaEntry {
  key: string;
  value: unknown;
}

export class ShelfDB extends Dexie {
  books!: Table<Book, string>;
  sessions!: Table<Session, string>;
  rooms!: Table<Room, string>;
  bookcases!: Table<Bookcase, string>;
  shelves!: Table<Shelf, string>;
  settings!: Table<SyncedSettings, string>;
  covers!: Table<CoverBlob, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'shelf-index') {
    super(name);
    this.version(1).stores({
      books: 'id, isbn13, status, updatedAt, location.shelfId',
      sessions: 'id, bookId, updatedAt',
      rooms: 'id, updatedAt',
      bookcases: 'id, roomId, updatedAt',
      shelves: 'id, bookcaseId, updatedAt',
      settings: 'id',
      covers: 'bookId, synced',
      meta: 'key',
    });
  }
}

export const db = new ShelfDB();

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
