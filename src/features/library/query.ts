import { type Book, type Category, type Status, collectionOf } from '../../data/models';
import { type ResolvedShelf, locationSortKey } from '../locations/util';

export type SortKey = 'title' | 'author' | 'added' | 'length' | 'rating' | 'location';

export interface Filters {
  text: string;
  status: Status | '';
  category: Category | '';
  collection: '' | 'owned' | 'borrowed';
  partnerRead: '' | 'yes' | 'no';
  roomId: string;
  bookcaseId: string;
  shelfId: string;
  tag: string;
  series: string;
  unshelved: boolean;
}

export const EMPTY_FILTERS: Filters = {
  text: '',
  status: '',
  category: '',
  collection: '',
  partnerRead: '',
  roomId: '',
  bookcaseId: '',
  shelfId: '',
  tag: '',
  series: '',
  unshelved: false,
};

/** Title without leading articles, for sorting. */
export function sortableTitle(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, '').toLowerCase();
}

/** Surname-first key for the first author. */
export function authorKey(authors: string[]): string {
  const first = authors[0];
  if (!first) return '￿';
  const parts = first.trim().split(/\s+/);
  const last = parts.pop() ?? '';
  return `${last} ${parts.join(' ')}`.toLowerCase();
}

export function matchesText(book: Book, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/[^0-9x]/g, '');
  if (digits.length >= 10 && book.isbn13?.includes(digits)) return true;
  const hay = [book.title, book.subtitle ?? '', ...book.authors, ...book.tags, book.series ?? '']
    .join('\n')
    .toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export function filterBooks(books: Book[], f: Filters, shelves: Map<string, ResolvedShelf>): Book[] {
  return books.filter((b) => {
    if (b.deleted) return false;
    // The library is what you have; wishlist books live in Discover.
    if (collectionOf(b) === 'wishlist') return false;
    if (f.status && b.status !== f.status) return false;
    if (f.category && b.category !== f.category) return false;
    if (f.collection && collectionOf(b) !== f.collection) return false;
    if (f.partnerRead === 'yes' && !b.partnerRead) return false;
    if (f.partnerRead === 'no' && b.partnerRead) return false;
    if (f.tag && !b.tags.includes(f.tag)) return false;
    if (f.series && b.series !== f.series) return false;
    if (f.unshelved && b.location) return false;
    if (f.roomId || f.bookcaseId || f.shelfId) {
      const loc = b.location && shelves.get(b.location.shelfId);
      if (!loc) return false;
      if (f.shelfId && loc.shelf.id !== f.shelfId) return false;
      if (f.bookcaseId && loc.bookcase.id !== f.bookcaseId) return false;
      if (f.roomId && loc.room.id !== f.roomId) return false;
    }
    return matchesText(b, f.text);
  });
}

export function sortBooks(books: Book[], key: SortKey, shelves: Map<string, ResolvedShelf>): Book[] {
  const byTitle = (a: Book, b: Book) => sortableTitle(a.title).localeCompare(sortableTitle(b.title));
  const cmp: Record<SortKey, (a: Book, b: Book) => number> = {
    title: byTitle,
    author: (a, b) =>
      authorKey(a.authors).localeCompare(authorKey(b.authors)) ||
      (a.series ?? '').localeCompare(b.series ?? '') ||
      (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0) ||
      byTitle(a, b),
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),
    length: (a, b) => (b.wordCount?.value ?? b.pageCount ?? 0) - (a.wordCount?.value ?? a.pageCount ?? 0),
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byTitle(a, b),
    location: (a, b) =>
      locationSortKey(a.location ? shelves.get(a.location.shelfId) : undefined, a.location?.row).localeCompare(
        locationSortKey(b.location ? shelves.get(b.location.shelfId) : undefined, b.location?.row),
      ) || byTitle(a, b),
  };
  return [...books].sort(cmp[key]);
}
