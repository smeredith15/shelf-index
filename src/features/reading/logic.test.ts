import { describe, expect, it } from 'vitest';
import { type Session, blankBook } from '../../data/models';
import { daysBetween } from './dates';
import { calibrate, currentPage, effectiveWordCount, pace, readingDays, wordsFromSample } from './logic';

const session = (patch: Partial<Session> = {}): Session => ({
  id: 'r1',
  bookId: 'b1',
  start: '2026-09-02',
  end: '2026-09-19',
  outcome: 'finished',
  pauses: [],
  progress: [],
  updatedAt: '',
  deleted: false,
  ...patch,
});

describe('reading days and pace', () => {
  it('counts days across month boundaries', () => {
    expect(daysBetween('2026-01-31', '2026-03-01')).toBe(29);
  });

  it('counts start to end inclusive, minus paused days', () => {
    expect(readingDays(session())).toBe(18);
    expect(readingDays(session({ pauses: [{ from: '2026-09-08', to: '2026-09-11' }] }))).toBe(15);
  });

  it('measures open sessions and open pauses up to today', () => {
    const open = session({ end: null, outcome: 'reading', pauses: [{ from: '2026-09-08', to: null }] });
    expect(readingDays(open, '2026-09-10')).toBe(7);
  });

  it('computes pace from progress for books in progress', () => {
    const book = { pageCount: 300 };
    const s = session({
      start: '2026-10-01',
      end: null,
      outcome: 'reading',
      progress: [
        { date: '2026-10-03', page: 50 },
        { date: '2026-10-05', page: 150 },
      ],
    });
    expect(currentPage(s)).toBe(150);
    expect(pace(s, 90000, book, '2026-10-05')).toBe(9000);
    expect(pace(session(), 90000, book)).toBe(5000);
    expect(pace(session({ outcome: 'reading', end: null }), 90000, book)).toBeNull();
  });
});

describe('word counts', () => {
  it('computes sampled counts', () => {
    expect(wordsFromSample(55, 32, 300)).toBe(105600);
  });

  it('uses the default until enough books are counted, then calibrates per format', () => {
    const counted = (format: 'trade' | 'hardcover', pages: number, words: number) =>
      blankBook({ format, pageCount: pages, wordCount: { value: words, source: 'looked-up' } });
    expect(calibrate([counted('trade', 300, 90000)], 275).trade).toEqual({ wordsPerPage: 275, books: 0, basis: 'default' });

    const books = [
      counted('trade', 300, 90000),
      counted('trade', 200, 60000),
      counted('trade', 100, 30000),
      counted('hardcover', 400, 160000),
    ];
    const cal = calibrate(books);
    expect(cal.trade).toEqual({ wordsPerPage: 300, books: 3, basis: 'own' });
    // Hardcover has only one counted book, so it uses the average of all counted books.
    expect(cal.hardcover).toEqual({ wordsPerPage: 340, books: 4, basis: 'all' });

    const unknownCount = blankBook({ format: 'trade', bodyPages: 250, pageCount: 270 });
    expect(effectiveWordCount(unknownCount, cal)).toEqual({ value: 75000, source: 'estimated' });
    expect(effectiveWordCount(books[0], cal)).toEqual({ value: 90000, source: 'looked-up' });
    expect(effectiveWordCount(blankBook(), cal)).toBeNull();
  });
});
