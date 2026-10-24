import { useMemo, useState } from 'preact/hooks';
import { Empty } from '../../app/ui';
import { useLive } from '../../data/hooks';
import { liveSessions } from '../../data/reading';
import { liveBooks } from '../../data/store';
import { formatDate, monthLabel, today } from '../reading/dates';
import { useCalibration } from '../reading/useCalibration';
import { BarList, ChartCard, ColumnChart, LineChart, SplitBar, StatTile, compact, full } from './charts';
import { type ReadStats, type ToReadStats, type WordSource, earliestRead, readStats, toReadStats, yearEndProjection } from './compute';
import { type CountMode, PRESET_LABELS, type RangeChoice, type RangePreset, resolveRange } from './range';

const PREFS_KEY = 'shelf-index.stats';

interface Prefs {
  tab: 'read' | 'to-read';
  range: RangeChoice;
  mode: CountMode;
  metric: 'books' | 'pages' | 'words';
}

function loadPrefs(): Prefs {
  const now = today();
  const fallback: Prefs = {
    tab: 'read',
    range: { preset: 'this-year', from: `${now.slice(0, 4)}-01-01`, to: now },
    mode: 'spread',
    metric: 'words',
  };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return fallback;
  }
}

/** 12 days · 5 months · 2.3 years */
export function duration(days: number): string {
  if (days < 60) return `${Math.max(1, Math.round(days))} day${Math.round(days) === 1 ? '' : 's'}`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

const SOURCE_LABELS: Record<WordSource, string> = { counted: 'Counted', audiobook: 'From audiobooks', estimated: 'Estimated from pages' };

function sourceParts(by: Record<WordSource, number>) {
  return [
    { label: SOURCE_LABELS.counted, value: by.counted, slot: 1 as const },
    { label: SOURCE_LABELS.audiobook, value: by.audiobook, slot: 2 as const },
    { label: SOURCE_LABELS.estimated, value: by.estimated, slot: 3 as const },
  ];
}

function roughShare(by: Record<WordSource, number>): string | null {
  const total = by.counted + by.audiobook + by.estimated;
  if (!total) return null;
  const rough = by.estimated + by.audiobook;
  return rough ? `${Math.round((100 * rough) / total)}% estimated` : 'All counted';
}

export function StatsPage() {
  const books = useLive(liveBooks);
  const sessions = useLive(liveSessions);
  const calibration = useCalibration();
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const setPrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefsState(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* preference only */
    }
  };

  const now = today();
  const ctx = useMemo(
    () => (books && sessions && calibration ? { books, sessions, calibration, today: now } : null),
    [books, sessions, calibration, now],
  );
  const range = useMemo(
    () => (sessions ? resolveRange(prefs.range, earliestRead(sessions), now) : null),
    [sessions, prefs.range, now],
  );
  const read = useMemo(() => (ctx && range ? readStats(ctx, range.from, range.to, prefs.mode) : null), [ctx, range, prefs.mode]);
  const projection = useMemo(() => (ctx ? yearEndProjection(ctx) : null), [ctx]);
  const shelf = useMemo(() => (ctx ? toReadStats(ctx) : null), [ctx]);

  if (!ctx || !read || !projection || !shelf || !range) return <div class="page" />;

  return (
    <div class="page stats-page">
      <div class="page-head">
        <h1>Stats</h1>
        <div class="segmented">
          <button class={prefs.tab === 'read' ? 'active' : ''} onClick={() => setPrefs({ tab: 'read' })}>
            Read
          </button>
          <button class={prefs.tab === 'to-read' ? 'active' : ''} onClick={() => setPrefs({ tab: 'to-read' })}>
            To Read
          </button>
        </div>
      </div>

      {prefs.tab === 'read' ? (
        <>
          <div class="filter-row">
            <select
              value={prefs.range.preset}
              aria-label="Date range"
              onChange={(e) => {
                const preset = e.currentTarget.value as RangePreset;
                setPrefs({ range: { ...prefs.range, preset, ...(preset === 'custom' ? range : {}) } });
              }}
            >
              {(Object.keys(PRESET_LABELS) as RangePreset[]).map((p) => (
                <option value={p} key={p}>
                  {PRESET_LABELS[p]}
                </option>
              ))}
            </select>
            {prefs.range.preset === 'custom' && (
              <>
                <input
                  type="date"
                  value={prefs.range.from}
                  max={now}
                  aria-label="From"
                  onChange={(e) => setPrefs({ range: { ...prefs.range, from: e.currentTarget.value } })}
                />
                <span class="muted">to</span>
                <input
                  type="date"
                  value={prefs.range.to}
                  aria-label="To"
                  onChange={(e) => setPrefs({ range: { ...prefs.range, to: e.currentTarget.value } })}
                />
              </>
            )}
            <div class="segmented" title="How books read across the range's edges are counted">
              <button class={prefs.mode === 'spread' ? 'active' : ''} onClick={() => setPrefs({ mode: 'spread' })}>
                Spread over days read
              </button>
              <button class={prefs.mode === 'finish' ? 'active' : ''} onClick={() => setPrefs({ mode: 'finish' })}>
                Count at finish
              </button>
            </div>
          </div>
          <p class="tiny muted range-note">
            {formatDate(range.from)} – {formatDate(range.to)}.{' '}
            {prefs.mode === 'spread'
              ? 'Words and pages are spread across the days each book was read, so a book that straddles the range counts partly. Books finished are counted on their finish date.'
              : 'Each book counts in full on the day you finished it.'}
          </p>
          <ReadSection stats={read} projection={projection} prefs={prefs} setPrefs={setPrefs} hasSessions={sessions!.length > 0} />
        </>
      ) : (
        <ToReadSection stats={shelf} />
      )}
    </div>
  );
}

function ReadSection({
  stats,
  projection,
  prefs,
  setPrefs,
  hasSessions,
}: {
  stats: ReadStats;
  projection: ReturnType<typeof yearEndProjection>;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  hasSessions: boolean;
}) {
  if (!hasSessions) {
    return (
      <Empty>
        No reads recorded yet. Start a book from its page, or add past reads with their dates, and stats will appear here.
      </Empty>
    );
  }
  const multiYear = new Set(stats.months.map((m) => m.month.slice(0, 4))).size > 1;
  const metricUnit = { books: 'books', pages: 'pages', words: 'words' }[prefs.metric];
  const monthly = stats.months.map((m) => ({
    label: monthLabel(m.month, multiYear && m.month.endsWith('-01')),
    fullLabel: monthLabel(m.month, true),
    value: m[prefs.metric],
  }));
  const trend = stats.months.map((m) => ({ label: monthLabel(m.month), fullLabel: monthLabel(m.month, true), value: m.wordsPerDay }));
  const rough = roughShare(stats.wordsBySource);

  return (
    <>
      <div class="stat-grid">
        <StatTile
          label="Books finished"
          value={full(stats.booksFinished)}
          sub={[stats.rereads && `${stats.rereads} reread${stats.rereads === 1 ? '' : 's'}`, stats.dnfs && `${stats.dnfs} DNF`]
            .filter(Boolean)
            .join(' · ') || undefined}
        />
        <StatTile label="Words read" value={compact(stats.words)} sub={rough ?? undefined} />
        <StatTile label="Pages read" value={compact(stats.pages)} />
        <StatTile label="Words per day" value={compact(stats.wordsPerDay)} sub="Averaged over every day in the range" />
        <StatTile
          label="Average time to finish"
          value={stats.avgDaysToFinish === null ? '–' : duration(stats.avgDaysToFinish)}
          sub="Not counting paused days"
        />
      </div>

      <section class="chart-card projection">
        <h3>On pace for this year</h3>
        <p>
          <span class="big-number">{full(projection.projectedBooks)}</span> books and{' '}
          <span class="big-number">{compact(projection.projectedWords)}</span> words by Dec 31
        </p>
        <p class="tiny muted">
          {full(projection.booksSoFar)} books and {compact(projection.wordsSoFar)} words so far, plus your last 90 days' pace (
          {compact(projection.pace)} words a day) for the {projection.daysLeft} days left.
        </p>
      </section>

      {stats.months.length > 0 && (
        <ChartCard
          title={`${metricUnit[0].toUpperCase()}${metricUnit.slice(1)} per month`}
          table={{
            columns: ['Month', 'Books', 'Pages', 'Words', 'Words per day'],
            rows: stats.months.map((m) => [monthLabel(m.month, true), m.books, full(m.pages), full(m.words), full(m.wordsPerDay)]),
          }}
        >
          <div class="segmented chart-toggle">
            {(['books', 'pages', 'words'] as const).map((k) => (
              <button key={k} class={prefs.metric === k ? 'active' : ''} onClick={() => setPrefs({ metric: k })}>
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
          <ColumnChart data={monthly} unit={metricUnit} format={prefs.metric === 'books' ? full : compact} />
        </ChartCard>
      )}

      {stats.months.length > 1 && (
        <ChartCard
          title="Words per day"
          subtitle="Monthly average"
          table={{ columns: ['Month', 'Words per day'], rows: trend.map((t) => [t.fullLabel!, full(t.value)]) }}
        >
          <LineChart data={trend} unit="words a day" />
        </ChartCard>
      )}

      <div class="chart-pair">
        <ChartCard title="Where the word counts come from" subtitle="Counted means looked up or sampled.">
          <SplitBar parts={sourceParts(stats.wordsBySource)} />
        </ChartCard>
        <ChartCard
          title="Fiction and nonfiction"
          subtitle={`${stats.booksByCategory.fiction} fiction and ${stats.booksByCategory.nonfiction} nonfiction books finished. Bar shows words.`}
        >
          <SplitBar
            parts={[
              { label: 'Fiction', value: stats.wordsByCategory.fiction, slot: 1 },
              { label: 'Nonfiction', value: stats.wordsByCategory.nonfiction, slot: 2 },
            ]}
          />
        </ChartCard>
      </div>

      <div class="chart-pair">
        <ChartCard title="Length of books finished" subtitle="By word count">
          <BarList data={stats.lengths.map((l) => ({ label: l.label, value: l.count }))} />
        </ChartCard>
        <ChartCard title="Ratings" subtitle="Books finished in this range">
          <BarList data={stats.ratings.map((r) => ({ label: r.label, value: r.count }))} />
        </ChartCard>
      </div>

      <div class="chart-pair">
        <ChartCard title="Top authors" subtitle="Books finished">
          {stats.topAuthors.length ? (
            <BarList data={stats.topAuthors.map((a) => ({ label: a.name, value: a.count }))} />
          ) : (
            <p class="muted">None yet.</p>
          )}
        </ChartCard>
        <ChartCard title="Top subjects" subtitle="Books finished">
          {stats.topSubjects.length ? (
            <BarList data={stats.topSubjects.map((a) => ({ label: a.name, value: a.count }))} />
          ) : (
            <p class="muted">None yet.</p>
          )}
        </ChartCard>
      </div>

      {stats.paces.length > 0 && (
        <section class="chart-card">
          <h3>Pace per book</h3>
          <p class="tiny muted">Words per day from start to finish, not counting paused days.</p>
          <div class="chart-table-wrap">
            <table class="chart-table pace-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Finished</th>
                  <th>Days</th>
                  <th>Words/day</th>
                </tr>
              </thead>
              <tbody>
                {stats.paces.map((p) => (
                  <tr key={p.session.id}>
                    <td>
                      <a href={`#/book/${p.book.id}`}>{p.book.title}</a>
                    </td>
                    <td>{formatDate(p.session.end!)}</td>
                    <td>{p.days}</td>
                    <td>{full(p.pace)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function ToReadSection({ stats }: { stats: ToReadStats }) {
  if (stats.count === 0) return <Empty>Nothing on the To Read shelf.</Empty>;
  const rough = roughShare(stats.wordsBySource);
  return (
    <>
      <div class="stat-grid">
        <StatTile
          label="Books to read"
          value={full(stats.count)}
          sub={[`${stats.owned} owned`, stats.borrowed && `${stats.borrowed} borrowed`, stats.wishlist && `${stats.wishlist} more on the wishlist`]
            .filter(Boolean)
            .join(' · ')}
        />
        <StatTile
          label="Words to read"
          value={compact(stats.words)}
          sub={[rough, stats.unknownLength && `${stats.unknownLength} with no length`].filter(Boolean).join(' · ') || undefined}
        />
        <StatTile
          label="Time to clear the shelf"
          value={stats.daysToClear === null ? '–' : duration(stats.daysToClear)}
          sub={stats.daysToClear === null ? 'No reading in the last 90 days' : `At ${compact(stats.pace)} words a day (last 90 days)`}
        />
        <StatTile
          label="Up Next queue"
          value={`${stats.queue.fiction + stats.queue.nonfiction}`}
          sub={`${stats.queue.fiction} fiction · ${stats.queue.nonfiction} nonfiction${
            stats.queue.daysToRead !== null && stats.queue.words ? ` · about ${duration(stats.queue.daysToRead)}` : ''
          }`}
        />
      </div>
      <p>
        <a class="button primary" href="#/pick">
          Pick what to read next
        </a>
      </p>
      <div class="chart-pair">
        <ChartCard title="How long books have waited" subtitle="Time since each was added">
          <BarList data={stats.waiting.map((w) => ({ label: w.label, value: w.count }))} />
        </ChartCard>
        <ChartCard title="Where the word counts come from" subtitle="Counted means looked up or sampled.">
          <SplitBar parts={sourceParts(stats.wordsBySource)} />
        </ChartCard>
      </div>
      {stats.oldestOwned.length > 0 && (
        <section class="chart-card">
          <h3>Oldest unread books you own</h3>
          <ul class="oldest-list">
            {stats.oldestOwned.map(({ book, days }) => (
              <li key={book.id}>
                <a href={`#/book/${book.id}`}>{book.title}</a>
                <span class="muted">{duration(days)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
