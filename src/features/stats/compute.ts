import { type Book, type Category, type Session, collectionOf } from '../../data/models';
import { addDays, dateOf, daysBetween, eachDay, monthOf } from '../reading/dates';
import { type Calibration, type EffectiveWordCount, effectiveWordCount, readingDays, readingPages } from '../reading/logic';
import { dailyFractions } from './allocate';
import type { CountMode } from './range';

export type WordSource = 'counted' | 'audiobook' | 'estimated';

export function sourceOf(wc: EffectiveWordCount): WordSource {
  return wc.source === 'audiobook' ? 'audiobook' : wc.source === 'estimated' ? 'estimated' : 'counted';
}

export interface MonthRow {
  month: string;
  books: number;
  pages: number;
  words: number;
  /** Words per day over the days of this month inside the range (and not in the future). */
  wordsPerDay: number;
}

export interface PaceRow {
  session: Session;
  book: Book;
  words: number;
  days: number;
  pace: number;
}

export interface ReadStats {
  from: string;
  to: string;
  booksFinished: number;
  dnfs: number;
  rereads: number;
  pages: number;
  words: number;
  wordsPerDay: number;
  wordsBySource: Record<WordSource, number>;
  wordsByCategory: Record<Category, number>;
  booksByCategory: Record<Category, number>;
  months: MonthRow[];
  paces: PaceRow[];
  avgDaysToFinish: number | null;
  lengths: { label: string; count: number }[];
  topAuthors: { name: string; count: number }[];
  topSubjects: { name: string; count: number }[];
  ratings: { label: string; count: number }[];
}

interface Context {
  books: Book[];
  sessions: Session[];
  calibration: Calibration;
  today: string;
}

interface Prepared {
  session: Session;
  book: Book;
  wc: EffectiveWordCount | null;
}

function prepare({ books, sessions, calibration }: Context): Prepared[] {
  const byId = new Map(books.filter((b) => !b.deleted).map((b) => [b.id, b]));
  const out: Prepared[] = [];
  for (const session of sessions) {
    const book = byId.get(session.bookId);
    if (!book || session.deleted) continue;
    out.push({ session, book, wc: effectiveWordCount(book, calibration) });
  }
  return out;
}

/** Earliest date with any reading, for "All time". */
export function earliestRead(sessions: Session[]): string | null {
  const starts = sessions.filter((s) => !s.deleted).map((s) => s.start);
  return starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
}

/** Words and pages per day across every read, spread over the days they happened. */
function dailyTotals(prepared: Prepared[], asOf: string) {
  const days = new Map<string, { words: number; pages: number; bySource: Record<WordSource, number>; byCat: Record<Category, number> }>();
  for (const { session, book, wc } of prepared) {
    for (const [d, f] of dailyFractions(session, readingPages(book), asOf)) {
      let row = days.get(d);
      if (!row) {
        row = { words: 0, pages: 0, bySource: { counted: 0, audiobook: 0, estimated: 0 }, byCat: { fiction: 0, nonfiction: 0 } };
        days.set(d, row);
      }
      if (wc) {
        row.words += f * wc.value;
        row.bySource[sourceOf(wc)] += f * wc.value;
        row.byCat[book.category] += f * wc.value;
      }
      row.pages += f * (readingPages(book) ?? 0);
    }
  }
  return days;
}

/** Words per day over the last `days` days, spread across the days actually read. */
export function recentPace(ctx: Context, days = 90): number {
  const daily = dailyTotals(prepare(ctx), ctx.today);
  const from = addDays(ctx.today, -(days - 1));
  let words = 0;
  for (const [d, row] of daily) if (d >= from && d <= ctx.today) words += row.words;
  return words / days;
}

const LENGTH_BUCKETS: { label: string; max: number }[] = [
  { label: 'Under 50K', max: 50_000 },
  { label: '50–80K', max: 80_000 },
  { label: '80–120K', max: 120_000 },
  { label: '120–180K', max: 180_000 },
  { label: '180K+', max: Infinity },
];

function topCounts(values: string[], n: number): { name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key) continue;
    const row = counts.get(key) ?? { name: v.trim(), count: 0 };
    row.count++;
    counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, n);
}

export function readStats(ctx: Context, from: string, to: string, mode: CountMode): ReadStats {
  const prepared = prepare(ctx);
  const daily = dailyTotals(prepared, ctx.today);
  const inRange = (d: string | null) => !!d && d >= from && d <= to;

  const finished = prepared.filter((p) => p.session.outcome === 'finished' && inRange(p.session.end));
  const dnf = prepared.filter((p) => p.session.outcome === 'dnf' && inRange(p.session.end));

  // A reread is a finished read with an earlier finished read of the same book.
  const firstFinish = new Map<string, string>();
  for (const p of prepared) {
    if (p.session.outcome !== 'finished' || !p.session.end) continue;
    const prev = firstFinish.get(p.book.id);
    if (!prev || p.session.end < prev) firstFinish.set(p.book.id, p.session.end);
  }
  const rereads = finished.filter((p) => p.session.end! > firstFinish.get(p.book.id)!).length;

  const lastDay = to < ctx.today ? to : ctx.today;
  const monthKeys = from <= lastDay ? [...new Set(eachDay(from, lastDay).map(monthOf))] : [];
  const months = new Map<string, MonthRow>(monthKeys.map((m) => [m, { month: m, books: 0, pages: 0, words: 0, wordsPerDay: 0 }]));

  let words = 0;
  let pages = 0;
  const wordsBySource: Record<WordSource, number> = { counted: 0, audiobook: 0, estimated: 0 };
  const wordsByCategory: Record<Category, number> = { fiction: 0, nonfiction: 0 };

  if (mode === 'spread') {
    for (const [d, row] of daily) {
      if (!inRange(d)) continue;
      words += row.words;
      pages += row.pages;
      for (const k of Object.keys(wordsBySource) as WordSource[]) wordsBySource[k] += row.bySource[k];
      wordsByCategory.fiction += row.byCat.fiction;
      wordsByCategory.nonfiction += row.byCat.nonfiction;
      const m = months.get(monthOf(d));
      if (m) {
        m.words += row.words;
        m.pages += row.pages;
      }
    }
  } else {
    for (const { session, book, wc } of finished) {
      const w = wc?.value ?? 0;
      words += w;
      pages += readingPages(book) ?? 0;
      if (wc) wordsBySource[sourceOf(wc)] += w;
      wordsByCategory[book.category] += w;
      const m = months.get(monthOf(session.end!));
      if (m) {
        m.words += w;
        m.pages += readingPages(book) ?? 0;
      }
    }
  }

  const booksByCategory: Record<Category, number> = { fiction: 0, nonfiction: 0 };
  for (const { session, book } of finished) {
    booksByCategory[book.category]++;
    const m = months.get(monthOf(session.end!));
    if (m) m.books++;
  }
  for (const m of months.values()) {
    const start = m.month + '-01' > from ? m.month + '-01' : from;
    const monthEnd = addDays(`${m.month}-01`, 31).slice(0, 7) + '-01';
    const end = addDays(monthEnd, -1) < lastDay ? addDays(monthEnd, -1) : lastDay;
    m.wordsPerDay = m.words / (daysBetween(start, end) + 1);
  }

  const rangeDays = from <= lastDay ? daysBetween(from, lastDay) + 1 : 0;

  const paces: PaceRow[] = finished
    .filter((p) => p.wc)
    .map((p) => {
      const days = readingDays(p.session);
      return { session: p.session, book: p.book, words: p.wc!.value, days, pace: p.wc!.value / days };
    })
    .sort((a, b) => b.session.end!.localeCompare(a.session.end!));

  const lengths = [...LENGTH_BUCKETS.map((b) => ({ label: b.label, count: 0 })), { label: 'Unknown', count: 0 }];
  for (const p of finished) {
    if (!p.wc) lengths[lengths.length - 1].count++;
    else lengths[LENGTH_BUCKETS.findIndex((b) => p.wc!.value < b.max)].count++;
  }

  const ratedBooks = new Map(finished.map((p) => [p.book.id, p.book]));
  const ratings = [5, 4, 3, 2, 1].map((n) => ({ label: '★'.repeat(n), count: 0 }));
  let unrated = 0;
  for (const b of ratedBooks.values()) {
    if (b.rating) ratings[5 - b.rating].count++;
    else unrated++;
  }
  ratings.push({ label: 'Unrated', count: unrated });

  return {
    from,
    to,
    booksFinished: finished.length,
    dnfs: dnf.length,
    rereads,
    pages: Math.round(pages),
    words: Math.round(words),
    wordsPerDay: rangeDays ? words / rangeDays : 0,
    wordsBySource,
    wordsByCategory,
    booksByCategory,
    months: [...months.values()],
    paces,
    avgDaysToFinish: finished.length
      ? finished.reduce((s, p) => s + readingDays(p.session), 0) / finished.length
      : null,
    lengths,
    topAuthors: topCounts(finished.flatMap((p) => p.book.authors), 8),
    topSubjects: topCounts(finished.flatMap((p) => p.book.subjects), 8),
    ratings,
  };
}

export interface Projection {
  wordsSoFar: number;
  booksSoFar: number;
  pace: number;
  booksPerDay: number;
  projectedWords: number;
  projectedBooks: number;
  daysLeft: number;
}

/** Year-end totals: this year so far plus the last 90 days' pace for the rest of the year. */
export function yearEndProjection(ctx: Context): Projection {
  const year = ctx.today.slice(0, 4);
  const thisYear = readStats(ctx, `${year}-01-01`, ctx.today, 'spread');
  const pace = recentPace(ctx, 90);
  const from90 = addDays(ctx.today, -89);
  const booksLast90 = prepare(ctx).filter(
    (p) => p.session.outcome === 'finished' && p.session.end! >= from90 && p.session.end! <= ctx.today,
  ).length;
  const daysLeft = daysBetween(ctx.today, `${year}-12-31`);
  return {
    wordsSoFar: thisYear.words,
    booksSoFar: thisYear.booksFinished,
    pace,
    booksPerDay: booksLast90 / 90,
    projectedWords: Math.round(thisYear.words + pace * daysLeft),
    projectedBooks: Math.round(thisYear.booksFinished + (booksLast90 / 90) * daysLeft),
    daysLeft,
  };
}

export interface ToReadStats {
  count: number;
  words: number;
  unknownLength: number;
  wordsBySource: Record<WordSource, number>;
  owned: number;
  borrowed: number;
  /** Wishlist books waiting to be read, not counted in the shelf totals. */
  wishlist: number;
  pace: number;
  /** Days to read everything at the recent pace, or null with no recent reading. */
  daysToClear: number | null;
  waiting: { label: string; count: number }[];
  oldestOwned: { book: Book; days: number }[];
  queue: { fiction: number; nonfiction: number; words: number; daysToRead: number | null };
}

const WAIT_BUCKETS: { label: string; maxDays: number }[] = [
  { label: 'Under 1 month', maxDays: 30 },
  { label: '1–6 months', maxDays: 182 },
  { label: '6–12 months', maxDays: 365 },
  { label: '1–2 years', maxDays: 730 },
  { label: '2+ years', maxDays: Infinity },
];

export function toReadStats(ctx: Context): ToReadStats {
  const unread = ctx.books.filter((b) => !b.deleted && b.status === 'to-read');
  const shelf = unread.filter((b) => collectionOf(b) !== 'wishlist');
  const pace = recentPace(ctx, 90);
  const wordsBySource: Record<WordSource, number> = { counted: 0, audiobook: 0, estimated: 0 };
  let words = 0;
  let unknownLength = 0;
  for (const b of shelf) {
    const wc = effectiveWordCount(b, ctx.calibration);
    if (!wc) unknownLength++;
    else {
      words += wc.value;
      wordsBySource[sourceOf(wc)] += wc.value;
    }
  }
  const waitDays = (b: Book) => Math.max(0, daysBetween(dateOf(b.addedAt), ctx.today));
  const waiting = WAIT_BUCKETS.map((w) => ({ label: w.label, count: 0 }));
  for (const b of shelf) waiting[WAIT_BUCKETS.findIndex((w) => waitDays(b) < w.maxDays)].count++;

  const queued = ctx.books.filter((b) => !b.deleted && b.queue.inQueue);
  const queueWords = queued.reduce((s, b) => s + (effectiveWordCount(b, ctx.calibration)?.value ?? 0), 0);

  return {
    count: shelf.length,
    words,
    unknownLength,
    wordsBySource,
    owned: shelf.filter((b) => collectionOf(b) === 'owned').length,
    borrowed: shelf.filter((b) => collectionOf(b) === 'borrowed').length,
    wishlist: unread.length - shelf.length,
    pace,
    daysToClear: pace > 0 ? words / pace : null,
    waiting,
    oldestOwned: shelf
      .filter((b) => collectionOf(b) === 'owned')
      .map((book) => ({ book, days: waitDays(book) }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 10),
    queue: {
      fiction: queued.filter((b) => b.category === 'fiction').length,
      nonfiction: queued.filter((b) => b.category === 'nonfiction').length,
      words: queueWords,
      daysToRead: pace > 0 ? queueWords / pace : null,
    },
  };
}
