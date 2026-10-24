import { type Book, type Category, type Session, collectionOf } from '../../data/models';
import { dateOf, daysBetween } from '../reading/dates';
import { type Calibration, effectiveWordCount } from '../reading/logic';
import type { ResolvedShelf } from '../locations/util';

export type PickSource = 'queue' | 'to-read';
export type CategoryFilter = 'any' | Category | 'alternate';
export type LengthFilter = 'any' | 'short' | 'medium' | 'long';

export interface PickFilters {
  source: PickSource;
  category: CategoryFilter;
  length: LengthFilter;
  ownedOnly: boolean;
  roomId: string;
}

export const DEFAULT_FILTERS: PickFilters = { source: 'queue', category: 'any', length: 'any', ownedOnly: false, roomId: '' };

export const LENGTH_LABELS: Record<LengthFilter, string> = {
  any: 'Any length',
  short: 'Short (under 60K words)',
  medium: 'Medium (60–120K)',
  long: 'Long (over 120K)',
};

/** Category of the most recently finished book, for "Alternate". */
export function lastFinishedCategory(books: Book[], sessions: Session[]): Category | null {
  const byId = new Map(books.map((b) => [b.id, b]));
  const last = sessions
    .filter((s) => !s.deleted && s.outcome === 'finished' && s.end && byId.get(s.bookId) && !byId.get(s.bookId)!.deleted)
    .sort((a, b) => b.end!.localeCompare(a.end!) || b.updatedAt.localeCompare(a.updatedAt))[0];
  return last ? byId.get(last.bookId)!.category : null;
}

export function resolveCategory(filter: CategoryFilter, books: Book[], sessions: Session[]): Category | null {
  if (filter === 'any') return null;
  if (filter !== 'alternate') return filter;
  const last = lastFinishedCategory(books, sessions);
  return last === 'fiction' ? 'nonfiction' : last === 'nonfiction' ? 'fiction' : null;
}

export function candidates(
  books: Book[],
  sessions: Session[],
  filters: PickFilters,
  calibration: Calibration,
  shelves: Map<string, ResolvedShelf>,
): Book[] {
  const category = resolveCategory(filters.category, books, sessions);
  return books.filter((b) => {
    if (b.deleted || b.status !== 'to-read') return false;
    if (filters.source === 'queue' && !b.queue.inQueue) return false;
    if (category && b.category !== category) return false;
    // Picks come from books you have; wishlist books aren't on the shelf.
    if (collectionOf(b) === 'wishlist') return false;
    if (filters.ownedOnly && collectionOf(b) !== 'owned') return false;
    if (filters.roomId) {
      const loc = b.location && shelves.get(b.location.shelfId);
      if (!loc || loc.room.id !== filters.roomId) return false;
    }
    if (filters.length !== 'any') {
      const words = effectiveWordCount(b, calibration)?.value;
      if (words === undefined) return false;
      if (filters.length === 'short' && words >= 60_000) return false;
      if (filters.length === 'medium' && (words < 60_000 || words > 120_000)) return false;
      if (filters.length === 'long' && words <= 120_000) return false;
    }
    return true;
  });
}

export function daysWaiting(book: Book, today: string): number {
  return Math.max(0, daysBetween(dateOf(book.addedAt), today));
}

/** One extra chance per month waited, so long-neglected books come up more often. */
export function weight(book: Book, today: string): number {
  return 1 + daysWaiting(book, today) / 30;
}

export function weightedPick(books: Book[], today: string, random = Math.random): Book | null {
  if (books.length === 0) return null;
  const weights = books.map((b) => weight(b, today));
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < books.length; i++) {
    r -= weights[i];
    if (r < 0) return books[i];
  }
  return books[books.length - 1];
}

/** Weighted shuffle (each draw weighted like weightedPick), for head-to-head pools. */
export function weightedShuffle(books: Book[], today: string, random = Math.random): Book[] {
  const pool = [...books];
  const out: Book[] = [];
  while (pool.length) {
    const pick = weightedPick(pool, today, random)!;
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}

/** Head-to-head: the winner of each pair stays on and meets the next challenger until one is left. */
export interface Duel {
  champion: Book;
  challengers: Book[];
  round: number;
  rounds: number;
}

export function startDuel(pool: Book[]): Duel | null {
  if (pool.length < 2) return null;
  return { champion: pool[0], challengers: pool.slice(1), round: 1, rounds: pool.length - 1 };
}

/** Returns the next duel, or the overall winner when no challengers remain. */
export function chooseWinner(duel: Duel, winner: Book): Duel | Book {
  const rest = duel.challengers.slice(1);
  if (rest.length === 0) return winner;
  return { champion: winner, challengers: rest, round: duel.round + 1, rounds: duel.rounds };
}
