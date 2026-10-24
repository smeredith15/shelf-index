import { useMemo, useState } from 'preact/hooks';
import { navigate } from '../../app/router';
import { Badge, Cover, Empty } from '../../app/ui';
import { useLive } from '../../data/hooks';
import type { Book } from '../../data/models';
import { joinQueue, liveSessions, startReading } from '../../data/reading';
import { liveBooks, loadLocations } from '../../data/store';
import { type ResolvedShelf, resolveShelves } from '../locations/util';
import { today } from '../reading/dates';
import { type Calibration, effectiveWordCount } from '../reading/logic';
import { useCalibration } from '../reading/useCalibration';
import { compact } from '../stats/charts';
import { duration } from '../stats/StatsPage';
import {
  type CategoryFilter,
  DEFAULT_FILTERS,
  type Duel,
  LENGTH_LABELS,
  type LengthFilter,
  type PickFilters,
  candidates,
  chooseWinner,
  daysWaiting,
  lastFinishedCategory,
  startDuel,
  weightedPick,
  weightedShuffle,
} from './logic';

const PREFS_KEY = 'shelf-index.pick';
const DUEL_SIZES = [4, 8, 16];

function loadFilters(): PickFilters {
  try {
    return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function PickPage() {
  const books = useLive(liveBooks);
  const sessions = useLive(liveSessions);
  const locs = useLive(loadLocations);
  const calibration = useCalibration();
  const [filters, setFiltersState] = useState<PickFilters>(loadFilters);
  const [result, setResult] = useState<Book | null>(null);
  const [duel, setDuel] = useState<Duel | null>(null);
  const [duelSize, setDuelSize] = useState(8);
  const now = today();

  const shelves = useMemo(() => (locs ? resolveShelves(locs) : new Map()), [locs]);
  const pool = useMemo(
    () => (books && sessions && calibration ? candidates(books, sessions, filters, calibration, shelves) : []),
    [books, sessions, calibration, filters, shelves],
  );

  if (!books || !sessions || !locs || !calibration) return <div class="page" />;

  const setFilters = (patch: Partial<PickFilters>) => {
    const next = { ...filters, ...patch };
    setFiltersState(next);
    setResult(null);
    setDuel(null);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* preference only */
    }
  };
  const last = lastFinishedCategory(books, sessions);

  return (
    <div class="page">
      <h1>Pick next</h1>
      <div class="filter-row">
        <div class="segmented">
          <button class={filters.source === 'queue' ? 'active' : ''} onClick={() => setFilters({ source: 'queue' })}>
            Up Next
          </button>
          <button class={filters.source === 'to-read' ? 'active' : ''} onClick={() => setFilters({ source: 'to-read' })}>
            Whole To Read shelf
          </button>
        </div>
        <select value={filters.category} aria-label="Category" onChange={(e) => setFilters({ category: e.currentTarget.value as CategoryFilter })}>
          <option value="any">Fiction or nonfiction</option>
          <option value="fiction">Fiction</option>
          <option value="nonfiction">Nonfiction</option>
          <option value="alternate" disabled={!last}>
            Alternate{last ? ` (last was ${last})` : ''}
          </option>
        </select>
        <select value={filters.length} aria-label="Length" onChange={(e) => setFilters({ length: e.currentTarget.value as LengthFilter })}>
          {(Object.keys(LENGTH_LABELS) as LengthFilter[]).map((k) => (
            <option value={k} key={k}>
              {LENGTH_LABELS[k]}
            </option>
          ))}
        </select>
        {locs.rooms.length > 0 && (
          <select value={filters.roomId} aria-label="Room" onChange={(e) => setFilters({ roomId: e.currentTarget.value })}>
            <option value="">Any room</option>
            {locs.rooms.map((r) => (
              <option value={r.id} key={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        <label class="check">
          <input type="checkbox" checked={filters.ownedOnly} onChange={(e) => setFilters({ ownedOnly: e.currentTarget.checked })} />
          Owned only
        </label>
      </div>
      <p class="tiny muted">
        {pool.length} book{pool.length === 1 ? '' : 's'} match. Random picks favor books that have waited longest.
      </p>

      {pool.length === 0 ? (
        <Empty>
          {filters.source === 'queue' ? 'Nothing in Up Next matches. Try the whole To Read shelf.' : 'No books match these filters.'}
        </Empty>
      ) : duel ? (
        <DuelView
          duel={duel}
          now={now}
          onChoose={(winner) => {
            const next = chooseWinner(duel, winner);
            if ('champion' in next) setDuel(next);
            else {
              setDuel(null);
              setResult(next);
            }
          }}
          onCancel={() => setDuel(null)}
        />
      ) : (
        <>
          <div class="actions pick-actions">
            <button class="primary" onClick={() => setResult(weightedPick(pool, now))}>
              🎲 {result ? 'Pick again' : 'Random pick'}
            </button>
            {pool.length >= 2 && (
              <>
                <button
                  onClick={() => {
                    setResult(null);
                    setDuel(startDuel(weightedShuffle(pool, now).slice(0, duelSize)));
                  }}
                >
                  Head-to-head
                </button>
                {pool.length > 4 && (
                  <select value={duelSize} aria-label="Books in head-to-head" onChange={(e) => setDuelSize(Number(e.currentTarget.value))}>
                    {DUEL_SIZES.filter((n) => n < pool.length).map((n) => (
                      <option value={n} key={n}>
                        {n} books
                      </option>
                    ))}
                    <option value={pool.length}>All {pool.length}</option>
                  </select>
                )}
              </>
            )}
          </div>
          {result && (
            // Read the live record so actions like Add to Up Next show straight away.
            <PickResult book={books.find((b) => b.id === result.id) ?? result} now={now} shelves={shelves} calibration={calibration} />
          )}
        </>
      )}
    </div>
  );
}

function DuelView({ duel, now, onChoose, onCancel }: { duel: Duel; now: string; onChoose: (b: Book) => void; onCancel: () => void }) {
  const pair = [duel.champion, duel.challengers[0]];
  return (
    <section class="duel">
      <p class="muted">
        Round {duel.round} of {duel.rounds}. Tap the one you'd rather read.
      </p>
      <div class="duel-pair">
        {pair.map((b) => (
          <button key={b.id} class="duel-choice" onClick={() => onChoose(b)}>
            <Cover book={b} />
            <strong>{b.title}</strong>
            <span class="muted tiny">
              {b.authors[0] ?? ''} · waiting {duration(daysWaiting(b, now))}
            </span>
          </button>
        ))}
      </div>
      <button class="link" onClick={onCancel}>
        Stop
      </button>
    </section>
  );
}

function PickResult({
  book,
  now,
  shelves,
  calibration,
}: {
  book: Book;
  now: string;
  shelves: Map<string, ResolvedShelf>;
  calibration: Calibration;
}) {
  const loc = book.location ? shelves.get(book.location.shelfId) : undefined;
  const words = effectiveWordCount(book, calibration);
  return (
    <section class="pick-result card">
      <Cover book={book} resolved={loc} size="lg" />
      <div>
        <h2>{book.title}</h2>
        <p class="muted">{book.authors.join(', ')}</p>
        <p class="tiny muted">
          {book.category === 'fiction' ? 'Fiction' : 'Nonfiction'}
          {words && ` · ${compact(words.value)} words${words.source === 'estimated' ? ' (est.)' : ''}`} · waiting{' '}
          {duration(daysWaiting(book, now))}
          {!book.owned && ' · not owned'}
        </p>
        {loc && (
          <p>
            <Badge resolved={loc} row={book.location?.row} />
          </p>
        )}
        <div class="actions">
          <button
            class="primary"
            onClick={async () => {
              await startReading(book);
              navigate(`/book/${book.id}`);
            }}
          >
            Start reading
          </button>
          {!book.queue.inQueue && <button onClick={() => joinQueue(book)}>Add to Up Next</button>}
          <a class="button" href={`#/book/${book.id}`}>
            Open
          </a>
        </div>
      </div>
    </section>
  );
}
