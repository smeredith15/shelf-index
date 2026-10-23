import type { Book, Format, Session } from '../../data/models';
import { daysBetween, today } from './dates';

// ---------- Sessions ----------

export function isPaused(session: Session): boolean {
  return session.pauses.some((p) => p.to === null);
}

export function isOpen(session: Session): boolean {
  return session.end === null;
}

/**
 * Days spent reading: start through end (or today) inclusive, minus paused days.
 * A pause from the 8th to the 11th removes 3 days; the day you resume counts as reading.
 */
export function readingDays(session: Session, asOf = today()): number {
  const end = session.end ?? asOf;
  const total = daysBetween(session.start, end) + 1;
  const paused = session.pauses.reduce((sum, p) => sum + Math.max(0, daysBetween(p.from, p.to ?? end)), 0);
  return Math.max(1, total - paused);
}

/** Latest page reached, from progress updates. */
export function currentPage(session: Session): number | null {
  if (session.progress.length === 0) return null;
  return [...session.progress].sort((a, b) => a.date.localeCompare(b.date) || a.page - b.page).pop()!.page;
}

/** Fraction of the book read in this session (1 when finished). */
export function fractionRead(session: Session, book: Pick<Book, 'pageCount'>): number | null {
  if (session.outcome === 'finished') return 1;
  const page = currentPage(session);
  if (page === null || !book.pageCount) return null;
  return Math.min(1, page / book.pageCount);
}

/** Words per day for a session, or null if there isn't enough to go on. */
export function pace(session: Session, words: number | null, book: Pick<Book, 'pageCount'>, asOf = today()): number | null {
  if (!words) return null;
  const fraction = fractionRead(session, book);
  if (fraction === null || fraction === 0) return null;
  return Math.round((words * fraction) / readingDays(session, asOf));
}

/** Sessions for one book, newest first, without tombstones. */
export function sessionsFor(sessions: Session[], bookId: string): Session[] {
  return sessions.filter((s) => s.bookId === bookId && !s.deleted).sort((a, b) => b.start.localeCompare(a.start));
}

// ---------- Word counts ----------

export const FALLBACK_WORDS_PER_PAGE = 275;
/** Books with a trusted count needed before a format gets its own words-per-page figure. */
export const MIN_CALIBRATION_BOOKS = 3;

/** Words = (words on 5 lines ÷ 5) × lines per page × body pages. */
export function wordsFromSample(wordsOnFiveLines: number, linesPerPage: number, bodyPages: number): number {
  return Math.round((wordsOnFiveLines / 5) * linesPerPage * bodyPages);
}

function pagesFor(book: Pick<Book, 'bodyPages' | 'pageCount'>): number | null {
  return book.bodyPages ?? book.pageCount ?? null;
}

export interface FormatCalibration {
  wordsPerPage: number;
  books: number;
  /** 'own' = from your books of this format, 'all' = all your counted books, 'default' = settings value */
  basis: 'own' | 'all' | 'default';
}

export type Calibration = Record<Format | 'unknown', FormatCalibration>;

/** Words per page for each format, from books with looked-up or sampled counts. */
export function calibrate(books: Book[], defaultWordsPerPage = FALLBACK_WORDS_PER_PAGE): Calibration {
  const trusted = books.filter(
    (b) => !b.deleted && b.wordCount && b.wordCount.source !== 'estimated' && (pagesFor(b) ?? 0) > 0,
  );
  const ratio = (list: Book[]) =>
    Math.round(list.reduce((s, b) => s + b.wordCount!.value, 0) / list.reduce((s, b) => s + pagesFor(b)!, 0));

  const overall: FormatCalibration =
    trusted.length >= MIN_CALIBRATION_BOOKS
      ? { wordsPerPage: ratio(trusted), books: trusted.length, basis: 'all' }
      : { wordsPerPage: defaultWordsPerPage, books: 0, basis: 'default' };

  const forFormat = (format: Format): FormatCalibration => {
    const own = trusted.filter((b) => b.format === format);
    return own.length >= MIN_CALIBRATION_BOOKS ? { wordsPerPage: ratio(own), books: own.length, basis: 'own' } : overall;
  };

  return {
    'mass-market': forFormat('mass-market'),
    trade: forFormat('trade'),
    hardcover: forFormat('hardcover'),
    other: forFormat('other'),
    unknown: overall,
  };
}

export interface EffectiveWordCount {
  value: number;
  source: 'looked-up' | 'sampled' | 'estimated';
}

/**
 * The count to use in totals: a stored count if there is one, otherwise pages × words per page
 * for the book's format. Estimates aren't stored, so they improve as calibration does.
 */
export function effectiveWordCount(book: Book, calibration: Calibration): EffectiveWordCount | null {
  if (book.wordCount) return book.wordCount;
  const pages = pagesFor(book);
  if (!pages) return null;
  return { value: Math.round(pages * calibration[book.format ?? 'unknown'].wordsPerPage), source: 'estimated' };
}
