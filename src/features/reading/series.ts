import type { Book } from '../../data/models';

export type NextInSeries =
  /** The next book is in the library and has no reading plans yet. */
  | { kind: 'existing'; book: Book }
  /** The next book isn't in the library (and no placeholder for it exists yet). */
  | { kind: 'missing'; series: string; index: number };

/**
 * A series name reduced to what identifies it, so "Millennium series", "The Millennium Trilogy"
 * and "millennium" all match. Generic trailing words and a leading "The" are dropped.
 */
export function seriesKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/^\s*the\s+/, '')
    .replace(/\s+(series|trilogy|saga|sequence|cycle|quartet|duology|books|novels)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A title reduced for matching: no subtitle, leading article, punctuation or apostrophes. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .split(/:\s/)[0]
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/^\s*(the|a|an)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const surname = (name: string) => name.trim().split(/\s+/).pop()?.toLowerCase() ?? '';

/** A library book with this title (and, when both sides have authors, a shared surname). */
export function findByTitle(books: Book[], title: string, authors: string[]): Book | undefined {
  const key = titleKey(title);
  const names = new Set(authors.map(surname).filter(Boolean));
  return books.find(
    (b) =>
      !b.deleted &&
      !b.seriesPlaceholder &&
      titleKey(b.title) === key &&
      (names.size === 0 || b.authors.length === 0 || b.authors.some((a) => names.has(surname(a)))),
  );
}

/**
 * What should go on To Read after finishing `finished`, or null if nothing. Only acts when this is
 * the furthest read book in its series, so recording old reads doesn't queue up books long past.
 * `readIds` are books with a finished read.
 */
export function nextInSeries(books: Book[], finished: Book, readIds: Set<string>): NextInSeries | null {
  if (!finished.series || finished.seriesIndex === null) return null;
  const index = finished.seriesIndex;
  const same = books.filter(
    (b) =>
      !b.deleted && b.id !== finished.id && b.series && seriesKey(b.series) === seriesKey(finished.series!) && b.seriesIndex !== null,
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
