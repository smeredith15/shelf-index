import { type Book, type Session, collectionOf } from '../../data/models';

/**
 * Books marked Read with no dated read behind them, so stats can't place them in time.
 * Books dismissed with "Don't know the dates" are split out rather than counted.
 */
export function undatedReads(books: Book[], sessions: Session[]): { missing: Book[]; dismissed: Book[] } {
  const dated = new Set(sessions.filter((s) => !s.deleted && s.outcome === 'finished' && s.end).map((s) => s.bookId));
  const undated = books.filter(
    (b) => !b.deleted && b.status === 'read' && collectionOf(b) !== 'wishlist' && !dated.has(b.id),
  );
  return { missing: undated.filter((b) => !b.datesUnknown), dismissed: undated.filter((b) => b.datesUnknown) };
}
