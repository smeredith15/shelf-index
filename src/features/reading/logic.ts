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
export function fractionRead(session: Session, book: Pick<Book, 'pageCount' | 'bodyPages'>): number | null {
  if (session.outcome === 'finished') return 1;
  const page = currentPage(session);
  const pages = readingPages(book);
  if (page === null || !pages) return null;
  return Math.min(1, page / pages);
}

/** Words per day for a session, or null if there isn't enough to go on. */
export function pace(
  session: Session,
  words: number | null,
  book: Pick<Book, 'pageCount' | 'bodyPages'>,
  asOf = today(),
): number | null {
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
/** About 9,300 words per finished hour, the usual publishing rule of thumb for narration. */
export const FALLBACK_WORDS_PER_MINUTE = 155;
/** Books with a trusted count needed before a format (or audio) gets its own figure. */
export const MIN_CALIBRATION_BOOKS = 3;

/** Words = (words on 5 lines ÷ 5) × lines per page × body pages. */
export function wordsFromSample(wordsOnFiveLines: number, linesPerPage: number, bodyPages: number): number {
  return Math.round((wordsOnFiveLines / 5) * linesPerPage * bodyPages);
}

/**
 * The pages actually read: body pages when known (front and back matter aren't read, and page
 * numbers usually start at chapter one), otherwise the total. Progress, pace, pages-read stats
 * and word estimates all measure against this.
 */
export function readingPages(book: Pick<Book, 'bodyPages' | 'pageCount'>): number | null {
  return book.bodyPages || book.pageCount || null;
}

const pagesFor = readingPages;

export interface FormatCalibration {
  wordsPerPage: number;
  books: number;
  /** 'own' = from your books of this format, 'all' = all your counted books, 'default' = settings value */
  basis: 'own' | 'all' | 'default';
}

export interface AudioCalibration {
  wordsPerMinute: number;
  books: number;
  basis: 'own' | 'default';
}

export interface Calibration {
  pages: Record<Format | 'unknown', FormatCalibration>;
  audio: AudioCalibration;
}

/** True for counts that came from the book itself rather than an estimate. */
function isTrusted(book: Book): boolean {
  return !book.deleted && !!book.wordCount && book.wordCount.source !== 'estimated';
}

/** Words per page for each format and words per minute for audiobooks, from books with looked-up or sampled counts. */
export function calibrate(
  books: Book[],
  defaultWordsPerPage = FALLBACK_WORDS_PER_PAGE,
  defaultWordsPerMinute = FALLBACK_WORDS_PER_MINUTE,
): Calibration {
  const trusted = books.filter((b) => isTrusted(b) && (pagesFor(b) ?? 0) > 0);
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

  const timed = books.filter((b) => isTrusted(b) && (b.audioMinutes ?? 0) > 0);
  const audio: AudioCalibration =
    timed.length >= MIN_CALIBRATION_BOOKS
      ? {
          wordsPerMinute: Math.round(
            timed.reduce((s, b) => s + b.wordCount!.value, 0) / timed.reduce((s, b) => s + b.audioMinutes!, 0),
          ),
          books: timed.length,
          basis: 'own',
        }
      : { wordsPerMinute: defaultWordsPerMinute, books: 0, basis: 'default' };

  return {
    pages: {
      'mass-market': forFormat('mass-market'),
      trade: forFormat('trade'),
      hardcover: forFormat('hardcover'),
      ebook: forFormat('ebook'),
      other: forFormat('other'),
      unknown: overall,
    },
    audio,
  };
}

export interface EffectiveWordCount {
  value: number;
  source: 'looked-up' | 'sampled' | 'audiobook' | 'estimated';
}

/**
 * The count to use in totals, best source first: a looked-up or sampled count, then audiobook
 * length × narration speed, then a hand-entered estimate, then pages × words per page.
 * Audiobook and page estimates aren't stored, so they improve as calibration does.
 */
export function effectiveWordCount(book: Book, calibration: Calibration): EffectiveWordCount | null {
  if (book.wordCount && book.wordCount.source !== 'estimated') return book.wordCount;
  if (book.audioMinutes) {
    return { value: Math.round(book.audioMinutes * calibration.audio.wordsPerMinute), source: 'audiobook' };
  }
  if (book.wordCount) return book.wordCount;
  const pages = pagesFor(book);
  if (!pages) return null;
  return { value: Math.round(pages * calibration.pages[book.format ?? 'unknown'].wordsPerPage), source: 'estimated' };
}

/** Parses "10:30", "10h 30m", "10h", "630m" or a bare number of minutes. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?|s)?)?)?$/);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  if (/^\d+$/.test(t)) return Number(t);
  return null;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
