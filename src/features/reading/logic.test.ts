import { describe, expect, it } from 'vitest';
import { type Session, blankBook } from '../../data/models';
import { daysBetween } from './dates';
import {
  calibrate,
  currentPage,
  effectiveWordCount,
  formatDuration,
  fractionRead,
  pace,
  parseDuration,
  readingDays,
  readingPages,
  wordsFromSample,
} from './logic';

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
    const book = { pageCount: 300, bodyPages: null };
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

    // With body pages entered, page 150 is half of a 300-page body even in a 340-page book.
    const withBody = { pageCount: 340, bodyPages: 300 };
    expect(fractionRead(s, withBody)).toBe(0.5);
    expect(pace(s, 90000, withBody, '2026-10-05')).toBe(9000);
    expect(readingPages(withBody)).toBe(300);
    expect(readingPages({ pageCount: 340, bodyPages: null })).toBe(340);
  });
});

describe('word counts', () => {
  it('computes sampled counts', () => {
    expect(wordsFromSample(55, 32, 300)).toBe(105600);
  });

  it('uses the default until enough books are counted, then calibrates per format', () => {
    const counted = (format: 'trade' | 'hardcover', pages: number, words: number) =>
      blankBook({ format, pageCount: pages, wordCount: { value: words, source: 'looked-up' } });
    expect(calibrate([counted('trade', 300, 90000)], 275).pages.trade).toEqual({ wordsPerPage: 275, books: 0, basis: 'default' });

    const books = [
      counted('trade', 300, 90000),
      counted('trade', 200, 60000),
      counted('trade', 100, 30000),
      counted('hardcover', 400, 160000),
    ];
    const cal = calibrate(books);
    expect(cal.pages.trade).toEqual({ wordsPerPage: 300, books: 3, basis: 'own' });
    // Hardcover has only one counted book, so it uses the average of all counted books.
    expect(cal.pages.hardcover).toEqual({ wordsPerPage: 340, books: 4, basis: 'all' });

    const unknownCount = blankBook({ format: 'trade', bodyPages: 250, pageCount: 270 });
    expect(effectiveWordCount(unknownCount, cal)).toEqual({ value: 75000, source: 'estimated' });
    expect(effectiveWordCount(books[0], cal)).toEqual({ value: 90000, source: 'looked-up' });
    expect(effectiveWordCount(blankBook(), cal)).toBeNull();
  });

  it('estimates from audiobook length, calibrating narration speed from counted books', () => {
    const audio = (minutes: number, words?: number) =>
      blankBook({ audioMinutes: minutes, pageCount: 300, wordCount: words ? { value: words, source: 'looked-up' } : null });
    expect(calibrate([]).audio).toEqual({ wordsPerMinute: 155, books: 0, basis: 'default' });

    const cal = calibrate([audio(600, 96000), audio(500, 80000), audio(400, 64000)]);
    expect(cal.audio).toEqual({ wordsPerMinute: 160, books: 3, basis: 'own' });

    // A 10h 30m audiobook beats the page estimate but not a real count.
    expect(effectiveWordCount(audio(630), cal)).toEqual({ value: 100800, source: 'audiobook' });
    expect(effectiveWordCount(audio(630, 99000), cal)).toEqual({ value: 99000, source: 'looked-up' });
    const handEstimate = blankBook({ audioMinutes: 630, wordCount: { value: 50000, source: 'estimated' } });
    expect(effectiveWordCount(handEstimate, cal)?.source).toBe('audiobook');
  });

  it('parses and formats durations', () => {
    expect(parseDuration('10:30')).toBe(630);
    expect(parseDuration('10h 30m')).toBe(630);
    expect(parseDuration('10 hrs 5 mins')).toBe(605);
    expect(parseDuration('9h')).toBe(540);
    expect(parseDuration('45m')).toBe(45);
    expect(parseDuration('630')).toBe(630);
    expect(parseDuration('soon')).toBeNull();
    expect(formatDuration(630)).toBe('10h 30m');
  });
});
