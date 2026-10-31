import { describe, expect, it } from 'vitest';
import { type Book, type Session, blankBook } from '../../data/models';
import { calibrate } from '../reading/logic';
import { dailyFractions } from './allocate';
import { readStats, recentPace, toReadStats, yearEndProjection } from './compute';
import { resolveRange } from './range';

const session = (patch: Partial<Session>): Session => ({
  id: 'r' + Math.random().toString(36).slice(2, 7),
  bookId: 'b1',
  start: '2026-09-01',
  end: '2026-09-10',
  outcome: 'finished',
  pauses: [],
  progress: [],
  updatedAt: '',
  deleted: false,
  ...patch,
});

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe('dailyFractions', () => {
  it('spreads a finished read evenly over its days', () => {
    const f = dailyFractions(session({}), null, '2026-10-01');
    expect(f.size).toBe(10);
    expect(sum(f)).toBeCloseTo(1);
    expect(f.get('2026-09-01')).toBeCloseTo(0.1);
  });

  it('skips paused days, counting the resume day', () => {
    const f = dailyFractions(session({ pauses: [{ from: '2026-09-04', to: '2026-09-07' }] }), null, '2026-10-01');
    expect(f.has('2026-09-04')).toBe(false);
    expect(f.has('2026-09-06')).toBe(false);
    expect(f.has('2026-09-07')).toBe(true);
    expect(f.size).toBe(7);
    expect(sum(f)).toBeCloseTo(1);
  });

  it('uses progress updates to place reading where it happened', () => {
    // Pages 0-150 of 300 over Sep 1-2, then the rest over Sep 3-10.
    const f = dailyFractions(session({ progress: [{ date: '2026-09-02', page: 150 }] }), 300, '2026-10-01');
    expect(f.get('2026-09-01')).toBeCloseTo(0.25);
    expect(f.get('2026-09-02')).toBeCloseTo(0.25);
    expect(f.get('2026-09-03')).toBeCloseTo(0.5 / 8);
    expect(sum(f)).toBeCloseTo(1);
  });

  it('counts an unfinished read only up to the last update', () => {
    const open = session({ end: null, outcome: 'reading', progress: [{ date: '2026-09-05', page: 100 }] });
    const f = dailyFractions(open, 400, '2026-09-20');
    expect(sum(f)).toBeCloseTo(0.25);
    expect(f.has('2026-09-06')).toBe(false);
  });
});

describe('readStats', () => {
  const books: Book[] = [
    blankBook({ id: 'b1', status: 'read', category: 'fiction', pageCount: 300, wordCount: { value: 90_000, source: 'looked-up' }, authors: ['A. Writer'], rating: 4 }),
    blankBook({ id: 'b2', status: 'read', category: 'nonfiction', pageCount: 200, audioMinutes: 400, authors: ['B. Author'] }),
  ];
  const sessions = [
    // Straddles the Sep/Oct boundary: 10 days in September, 10 in October.
    session({ bookId: 'b1', start: '2026-09-21', end: '2026-10-10' }),
    session({ bookId: 'b2', start: '2026-10-01', end: '2026-10-05' }),
    session({ bookId: 'b1', start: '2026-08-01', end: '2026-08-05' }),
  ];
  const ctx = { books, sessions, calibration: calibrate(books), today: '2026-10-23' };

  it('spreads words across a range boundary by default', () => {
    const oct = readStats(ctx, '2026-10-01', '2026-10-31', 'spread');
    expect(oct.booksFinished).toBe(2);
    // Half of b1 (45K) plus all of b2 (400 min x 155 wpm = 62K).
    expect(oct.words).toBe(45_000 + 62_000);
    expect(oct.wordsBySource).toEqual({ counted: 45_000, audiobook: 62_000, estimated: 0 });
    expect(oct.months.map((m) => m.month)).toEqual(['2026-10']);
    // Words per day only counts days up to today.
    expect(oct.months[0].wordsPerDay).toBeCloseTo(107_000 / 23);
  });

  it('can count each book fully on its finish date instead', () => {
    const oct = readStats(ctx, '2026-10-01', '2026-10-31', 'finish');
    expect(oct.words).toBe(90_000 + 62_000);
    const sep = readStats(ctx, '2026-09-01', '2026-09-30', 'finish');
    expect(sep.words).toBe(0);
    expect(readStats(ctx, '2026-09-01', '2026-09-30', 'spread').words).toBe(45_000);
  });

  it('finds rereads, lengths, authors and ratings', () => {
    const all = readStats(ctx, '2026-01-01', '2026-10-23', 'spread');
    expect(all.booksFinished).toBe(3);
    expect(all.rereads).toBe(1);
    expect(all.lengths.find((l) => l.label === '80–120K')?.count).toBe(2);
    expect(all.lengths.find((l) => l.label === '50–80K')?.count).toBe(1);
    expect(all.topAuthors[0]).toEqual({ name: 'A. Writer', count: 2 });
    expect(all.ratings.find((r) => r.label === '★★★★')?.count).toBe(1);
    expect(all.ratings.find((r) => r.label === 'Unrated')?.count).toBe(1);
    expect(all.avgDaysToFinish).toBeCloseTo((20 + 5 + 5) / 3);
    expect(all.paces[0].book.id).toBe('b1');
  });

  it('projects the year and the to-read shelf from the last 90 days', () => {
    const pace = recentPace(ctx);
    // Everything read since Jul 26: all three reads.
    expect(pace).toBeCloseTo((90_000 * 2 + 62_000) / 90);
    const p = yearEndProjection(ctx);
    expect(p.daysLeft).toBe(69);
    expect(p.projectedWords).toBe(Math.round(p.wordsSoFar + pace * 69));

    const shelf = toReadStats({
      ...ctx,
      books: [...books, blankBook({ id: 'b3', status: 'to-read', pageCount: 100, owned: true, addedAt: '2025-01-01T12:00:00Z' })],
    });
    expect(shelf.count).toBe(1);
    expect(shelf.words).toBe(27_500);
    expect(shelf.daysToClear).toBeCloseTo(27_500 / pace);
    expect(shelf.waiting.find((w) => w.label === '1–2 years')?.count).toBe(1);
  });
});

describe('resolveRange', () => {
  it('resolves presets', () => {
    expect(resolveRange({ preset: 'this-year', from: '', to: '' }, null, '2026-10-23')).toEqual({ from: '2026-01-01', to: '2026-10-23' });
    expect(resolveRange({ preset: 'last-year', from: '', to: '' }, null, '2026-10-23')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(resolveRange({ preset: 'last-12', from: '', to: '' }, null, '2026-10-23').from).toBe('2025-10-24');
    expect(resolveRange({ preset: 'all', from: '', to: '' }, '2019-05-02', '2026-10-23').from).toBe('2019-05-02');
    expect(resolveRange({ preset: 'custom', from: '2026-03-01', to: '2026-02-01' }, null, '2026-10-23')).toEqual({ from: '2026-02-01', to: '2026-03-01' });
  });
});

describe('body pages', () => {
  it('measures progress and pages read against body pages when known', () => {
    const b = blankBook({ id: 'bp', status: 'reading', pageCount: 360, bodyPages: 300, wordCount: { value: 90_000, source: 'looked-up' } });
    const open = session({ bookId: 'bp', start: '2026-10-01', end: null, outcome: 'reading', progress: [{ date: '2026-10-10', page: 150 }] });
    const stats = readStats({ books: [b], sessions: [open], calibration: calibrate([b]), today: '2026-10-20' }, '2026-10-01', '2026-10-20', 'spread');
    // Page 150 of a 300-page body is half the book: 45K words and 150 pages, not 150/360.
    expect(stats.words).toBe(45_000);
    expect(stats.pages).toBe(150);
  });
});
