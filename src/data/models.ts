export type Status = 'to-read' | 'reading' | 'read' | 'dnf';
export type Category = 'fiction' | 'nonfiction';
export type Format = 'mass-market' | 'trade' | 'hardcover' | 'other';
export type Row = 'front' | 'back';
export type WordCountSource = 'looked-up' | 'sampled' | 'estimated';

/** Every synced record carries these so devices can merge (newer wins, deletes are tombstones). */
export interface Syncable {
  id: string;
  updatedAt: string;
  deleted: boolean;
}

export interface Book extends Syncable {
  isbn13: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  series: string | null;
  seriesIndex: number | null;
  publisher: string | null;
  pubYear: number | null;
  format: Format | null;
  pageCount: number | null;
  bodyPages: number | null;
  category: Category;
  subjects: string[];
  tags: string[];
  status: Status;
  owned: boolean;
  location: { shelfId: string; row: Row } | null;
  queue: { inQueue: boolean; position: number | null };
  wordCount: { value: number; source: WordCountSource } | null;
  rating: number | null;
  notes: string;
  /** Path in the data repo, e.g. covers/b_7f3k2.jpg */
  cover: string | null;
  /** External cover URL, used when the image couldn't be copied into the data repo. */
  coverUrl: string | null;
  addedAt: string;
}

export interface Session extends Syncable {
  bookId: string;
  start: string;
  end: string | null;
  outcome: 'reading' | 'finished' | 'dnf' | null;
  pauses: { from: string; to: string | null }[];
  progress: { date: string; page: number }[];
}

export interface Room extends Syncable {
  name: string;
  code: string;
}

export interface Bookcase extends Syncable {
  roomId: string;
  number: number;
  name: string;
}

export interface Shelf extends Syncable {
  bookcaseId: string;
  number: number;
  hasBackRow: boolean;
}

export interface SyncedSettings extends Syncable {
  defaultWordsPerPage: number;
  upNextShelfId: string | null;
  /** Move a book to the Up Next shelf when it joins the queue. */
  upNextAutoMove: boolean;
}

/** Cover image bytes, kept locally and pushed to covers/<bookId>.jpg. */
export interface CoverBlob {
  bookId: string;
  blob: Blob;
  /** Changes whenever the image is replaced, so an in-flight upload can't mark a newer image synced. */
  rev: string;
  /** True once this exact blob exists in the data repo. */
  synced: boolean;
}

export const STATUS_LABELS: Record<Status, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  read: 'Read',
  dnf: 'DNF',
};

export const FORMAT_LABELS: Record<Format, string> = {
  'mass-market': 'Mass market',
  trade: 'Trade paperback',
  hardcover: 'Hardcover',
  other: 'Other',
};

export function now(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${time}${rand}`;
}

export function blankBook(partial: Partial<Book> = {}): Book {
  const t = now();
  return {
    id: newId('b'),
    isbn13: null,
    title: '',
    subtitle: null,
    authors: [],
    series: null,
    seriesIndex: null,
    publisher: null,
    pubYear: null,
    format: null,
    pageCount: null,
    bodyPages: null,
    category: 'nonfiction',
    subjects: [],
    tags: [],
    status: 'to-read',
    owned: true,
    location: null,
    queue: { inQueue: false, position: null },
    wordCount: null,
    rating: null,
    notes: '',
    cover: null,
    coverUrl: null,
    addedAt: t,
    updatedAt: t,
    deleted: false,
    ...partial,
  };
}
