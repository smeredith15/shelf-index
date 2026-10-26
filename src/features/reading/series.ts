import type { Book } from '../../data/models';

export type NextInSeries =
  /** The next book is in the library and has no reading plans yet. */
  | { kind: 'existing'; book: Book }
  /** The next book isn't in the library (and no placeholder for it exists yet). */
  | { kind: 'missing'; series: string; index: number };

const norm = (s: string) => s.trim().toLowerCase();

/**
 * What should go on To Read after finishing `finished`, or null if nothing. Only acts when this is
 * the furthest read book in its series, so recording old reads doesn't queue up books long past.
 * `readIds` are books with a finished read.
 */
export function nextInSeries(books: Book[], finished: Book, readIds: Set<string>): NextInSeries | null {
  if (!finished.series || finished.seriesIndex === null) return null;
  const index = finished.seriesIndex;
  const same = books.filter(
    (b) => !b.deleted && b.id !== finished.id && b.series && norm(b.series) === norm(finished.series!) && b.seriesIndex !== null,
  );
  const readFurther = same.some((b) => (readIds.has(b.id) || b.status === 'read') && b.seriesIndex! > index);
  if (readFurther) return null;

  // The next whole number, or anything between (a novella numbered 1.5 comes before 2).
  const expected = Math.floor(index) + 1;
  const candidates = same.filter((b) => b.seriesIndex! > index && b.seriesIndex! <= expected).sort((a, b) => a.seriesIndex! - b.seriesIndex!);
  const next = candidates[0];
  if (next) {
    if (next.seriesPlaceholder) return null;
    return next.status === 'none' ? { kind: 'existing', book: next } : null;
  }
  return { kind: 'missing', series: finished.series.trim(), index: expected };
}
