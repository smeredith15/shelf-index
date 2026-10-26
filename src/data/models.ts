export type Status = 'to-read' | 'reading' | 'read' | 'dnf';
export type Category = 'fiction' | 'nonfiction';
export type Format = 'mass-market' | 'trade' | 'hardcover' | 'ebook' | 'other';
/** Where a book stands in the collection. Wishlist books live in Discover, not the library. */
export type Collection = 'owned' | 'borrowed' | 'wishlist';
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
  /** Kept in step with `collection` (true only when owned) for records written before it existed. */
  owned: boolean;
  collection?: Collection;
  /** Read by the other reader in the house (a blue dot on the cover; mine is green). */
  partnerRead?: boolean;
  /** Marked Read without dates on purpose, so it isn't flagged as missing them. */
  datesUnknown?: boolean;
  location: { shelfId: string; row: Row } | null;
  queue: { inQueue: boolean; position: number | null };
  wordCount: { value: number; source: WordCountSource } | null;
  /** Length of the unabridged audiobook in minutes, used to estimate words when there's no count. */
  audioMinutes?: number | null;
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
  /** The Ebooks "room": its bookcases are apps or devices, each with one shelf. */
  ebook?: boolean;
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
  /** Name shown for the blue-dot reader. */
  partnerName: string;
  /** Optional Google Books API key, so lookups don't share Google's anonymous daily quota. */
  googleBooksKey?: string;
  /** Narration speed used for audiobook estimates until enough books calibrate it. */
  defaultWordsPerMinute: number;
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

export const COLLECTION_LABELS: Record<Collection, string> = {
  owned: 'Owned',
  borrowed: 'Borrowed',
  wishlist: 'Wishlist',
};

/** Older records only have `owned`: true reads as Owned, false as Wishlist. */
export function collectionOf(book: Pick<Book, 'owned' | 'collection'>): Collection {
  return book.collection ?? (book.owned ? 'owned' : 'wishlist');
}

export function withCollection<T extends Pick<Book, 'owned' | 'collection'>>(book: T, collection: Collection): T {
  return { ...book, collection, owned: collection === 'owned' };
}

export const FORMAT_LABELS: Record<Format, string> = {
  'mass-market': 'Mass market',
  trade: 'Trade paperback',
  hardcover: 'Hardcover',
  ebook: 'Ebook',
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
    collection: 'owned',
    partnerRead: false,
    location: null,
    queue: { inQueue: false, position: null },
    wordCount: null,
    audioMinutes: null,
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
