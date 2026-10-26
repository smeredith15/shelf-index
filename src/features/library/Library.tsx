import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Badge, Cover, Empty } from '../../app/ui';
import { useLive } from '../../data/hooks';
import { COLLECTION_LABELS, STATUS_LABELS, type Status, collectionOf } from '../../data/models';
import { liveSessions } from '../../data/reading';
import { liveBooks, loadLocations, loadSettings, saveBooks } from '../../data/store';
import { resolveShelves } from '../locations/util';
import { MoveDialog } from '../locations/MoveDialog';
import { UpNextGallery } from '../queue/UpNextGallery';
import { NowReading } from '../reading/NowReading';
import { EMPTY_FILTERS, type Filters, type SortKey, filterBooks, sortBooks } from './query';

const PREFS_KEY = 'shelf-index.library';

interface Prefs {
  sort: SortKey;
  view: 'grid' | 'list';
}

function loadPrefs(): Prefs {
  try {
    return { sort: 'title', view: 'grid', ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { sort: 'title', view: 'grid' };
  }
}

/**
 * Filters and scroll position survive opening a book and coming back. Kept for the session only:
 * a fresh launch starts at the top with no filters.
 */
const VIEW_KEY = 'shelf-index.library-view';

interface ViewState {
  filters: Filters;
  showFilters: boolean;
  scrollY: number;
}

function loadView(): ViewState | null {
  try {
    const raw = sessionStorage.getItem(VIEW_KEY);
    return raw ? (JSON.parse(raw) as ViewState) : null;
  } catch {
    return null;
  }
}

function saveView(patch: Partial<ViewState>) {
  try {
    const current = loadView() ?? { filters: EMPTY_FILTERS, showFilters: false, scrollY: 0 };
    sessionStorage.setItem(VIEW_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    /* convenience only */
  }
}

const isLibraryRoute = () => /^#?\/?(\?.*)?$/.test(location.hash);

export function Library({ params }: { params: URLSearchParams }) {
  const books = useLive(liveBooks);
  const locs = useLive(loadLocations);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const settings = useLive(loadSettings);
  const sessions = useLive(liveSessions);
  // A link with filters in it (e.g. "books with no location") starts fresh; otherwise pick up where you left off.
  const linked = params.has('unshelved') || params.has('tag') || params.has('series');
  const [view] = useState(() => (linked ? null : loadView()));
  const [filters, setFilters] = useState<Filters>(() =>
    view
      ? { ...EMPTY_FILTERS, ...view.filters }
      : {
          ...EMPTY_FILTERS,
          unshelved: params.get('unshelved') === '1',
          tag: params.get('tag') ?? '',
          series: params.get('series') ?? '',
        },
  );
  const [showFilters, setShowFilters] = useState(view ? view.showFilters : linked);
  const restored = useRef(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);

  const setPrefs = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefsState(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  };
  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  useEffect(() => saveView({ filters, showFilters }), [filters, showFilters]);
  useEffect(() => {
    const onScroll = () => {
      // The router scrolls to the top after the hash has already changed; don't record that.
      if (isLibraryRoute()) saveView({ scrollY: window.scrollY });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const resolved = useMemo(() => (locs ? resolveShelves(locs) : new Map()), [locs]);
  const shown = useMemo(
    () => (books ? sortBooks(filterBooks(books, filters, resolved), prefs.sort, resolved) : []),
    [books, filters, resolved, prefs.sort],
  );
  const allTags = useMemo(() => [...new Set((books ?? []).flatMap((b) => b.tags))].sort(), [books]);
  const allSeries = useMemo(
    () => [...new Set((books ?? []).map((b) => b.series).filter((s): s is string => !!s))].sort(),
    [books],
  );
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'text' && v).length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Once the books have rendered, return to where the list was.
  // Wait for everything the page renders, or the scroll would be clamped by a half-empty page.
  useLayoutEffect(() => {
    if (restored.current || !books || !locs || !settings || !sessions) return;
    restored.current = true;
    if (view?.scrollY) window.scrollTo(0, view.scrollY);
  }, [books, locs, settings, sessions]);

  if (!books || !locs || !settings || !sessions) return <div class="page" />;
  const owned = books.filter((b) => collectionOf(b) !== 'wishlist');
  const partner = settings.partnerName || 'Partner';

  return (
    <div class="page">
      <NowReading books={books} sessions={sessions} resolved={resolved} />
      {books.length > 0 && <UpNextGallery books={books} resolved={resolved} />}
      <div class="library-bar">
        <input
          type="search"
          placeholder={`Search ${owned.length} books`}
          value={filters.text}
          onInput={(e) => setFilter('text', e.currentTarget.value)}
        />
        <select value={prefs.sort} onChange={(e) => setPrefs({ sort: e.currentTarget.value as SortKey })} aria-label="Sort">
          <option value="title">Title</option>
          <option value="author">Author</option>
          <option value="added">Date added</option>
          <option value="length">Length</option>
          <option value="rating">Rating</option>
          <option value="location">Location</option>
        </select>
        <button class={showFilters || activeFilterCount ? 'active' : ''} onClick={() => setShowFilters(!showFilters)}>
          Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </button>
        <button onClick={() => setPrefs({ view: prefs.view === 'grid' ? 'list' : 'grid' })} aria-label="Toggle view">
          {prefs.view === 'grid' ? '☰' : '▦'}
        </button>
      </div>

      {showFilters && (
        <div class="filters">
          <select value={filters.status} onChange={(e) => setFilter('status', e.currentTarget.value as Status | '')}>
            <option value="">Any reading status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option value={k} key={k}>
                {v || 'No reading status'}
              </option>
            ))}
          </select>
          <select value={filters.category} onChange={(e) => setFilter('category', e.currentTarget.value as Filters['category'])}>
            <option value="">Fiction & nonfiction</option>
            <option value="fiction">Fiction</option>
            <option value="nonfiction">Nonfiction</option>
          </select>
          <select value={filters.collection} onChange={(e) => setFilter('collection', e.currentTarget.value as Filters['collection'])}>
            <option value="">Owned or borrowed</option>
            <option value="owned">{COLLECTION_LABELS.owned}</option>
            <option value="borrowed">{COLLECTION_LABELS.borrowed}</option>
          </select>
          <select value={filters.partnerRead} onChange={(e) => setFilter('partnerRead', e.currentTarget.value as Filters['partnerRead'])}>
            <option value="">Read by {partner} or not</option>
            <option value="yes">Read by {partner}</option>
            <option value="no">Not read by {partner}</option>
          </select>
          <select
            value={filters.roomId}
            onChange={(e) => setFilters((f) => ({ ...f, roomId: e.currentTarget.value, bookcaseId: '', shelfId: '' }))}
          >
            <option value="">Any room</option>
            {locs.rooms.map((r) => (
              <option value={r.id} key={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {filters.roomId && (
            <select
              value={filters.bookcaseId}
              onChange={(e) => setFilters((f) => ({ ...f, bookcaseId: e.currentTarget.value, shelfId: '' }))}
            >
              <option value="">Any bookcase</option>
              {locs.bookcases
                .filter((b) => b.roomId === filters.roomId)
                .map((b) => (
                  <option value={b.id} key={b.id}>
                    Bookcase {b.number}
                  </option>
                ))}
            </select>
          )}
          {filters.bookcaseId && (
            <select value={filters.shelfId} onChange={(e) => setFilter('shelfId', e.currentTarget.value)}>
              <option value="">Any shelf</option>
              {locs.shelves
                .filter((s) => s.bookcaseId === filters.bookcaseId)
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    Shelf {s.number}
                  </option>
                ))}
            </select>
          )}
          {allTags.length > 0 && (
            <select value={filters.tag} onChange={(e) => setFilter('tag', e.currentTarget.value)}>
              <option value="">Any tag</option>
              {allTags.map((t) => (
                <option value={t} key={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          {allSeries.length > 0 && (
            <select value={filters.series} onChange={(e) => setFilter('series', e.currentTarget.value)}>
              <option value="">Any series</option>
              {allSeries.map((s) => (
                <option value={s} key={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <label class="check">
            <input type="checkbox" checked={filters.unshelved} onChange={(e) => setFilter('unshelved', e.currentTarget.checked)} />
            No location
          </label>
          {activeFilterCount > 0 && (
            <button class="link" onClick={() => setFilters({ ...EMPTY_FILTERS, text: filters.text })}>
              Clear filters
            </button>
          )}
        </div>
      )}

      <div class="library-meta">
        <span class="muted">
          {shown.length === owned.length ? `${owned.length} books` : `${shown.length} of ${owned.length} books`}
        </span>
        {selecting ? (
          <span class="select-actions">
            <button class="link" onClick={() => setSelected(new Set(shown.map((b) => b.id)))}>
              All
            </button>
            <button class="primary small" disabled={selected.size === 0} onClick={() => setMoving(true)}>
              Move {selected.size || ''}
            </button>
            <button
              class="small"
              disabled={selected.size === 0}
              title={`Mark the selected books as read by ${partner} (blue dot)`}
              onClick={async () => {
                await saveBooks(books.filter((b) => selected.has(b.id)).map((b) => ({ ...b, partnerRead: true })));
                setSelecting(false);
                setSelected(new Set());
              }}
            >
              <span class="dot-key dot-partner" /> Read by {partner}
            </button>
            <select
              class="small-select"
              value=""
              disabled={selected.size === 0}
              aria-label="Set reading status for the selected books"
              onChange={async (e) => {
                const status = e.currentTarget.value as Status;
                await saveBooks(books.filter((b) => selected.has(b.id)).map((b) => ({ ...b, status })));
                setSelecting(false);
                setSelected(new Set());
              }}
            >
              <option value="" disabled>
                Reading…
              </option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option value={k} key={k}>
                  {v || 'No reading status'}
                </option>
              ))}
            </select>
            <button class="small" onClick={() => (setSelecting(false), setSelected(new Set()))}>
              Done
            </button>
          </span>
        ) : (
          shown.length > 0 && (
            <button class="link" onClick={() => setSelecting(true)}>
              Select
            </button>
          )
        )}
      </div>

      {owned.length === 0 ? (
        <Empty>
          <p>Your library is empty.</p>
          <a class="button primary" href="#/add">
            Add your first book
          </a>
        </Empty>
      ) : shown.length === 0 ? (
        <Empty>No books match.</Empty>
      ) : prefs.view === 'grid' ? (
        <div class="grid">
          {shown.map((b) => {
            const loc = b.location ? resolved.get(b.location.shelfId) : undefined;
            const isSel = selected.has(b.id);
            return (
              <a
                key={b.id}
                href={`#/book/${b.id}`}
                class={`grid-item${isSel ? ' selected' : ''}`}
                onClick={(e) => {
                  if (selecting) {
                    e.preventDefault();
                    toggle(b.id);
                  }
                }}
              >
                <Cover book={b} resolved={loc} />
                <div class="grid-title">{b.title}</div>
              </a>
            );
          })}
        </div>
      ) : (
        <ul class="list">
          {shown.map((b) => {
            const loc = b.location ? resolved.get(b.location.shelfId) : undefined;
            return (
              <li key={b.id} class={selected.has(b.id) ? 'selected' : ''}>
                <a
                  href={`#/book/${b.id}`}
                  onClick={(e) => {
                    if (selecting) {
                      e.preventDefault();
                      toggle(b.id);
                    }
                  }}
                >
                  <Cover book={b} size="sm" />
                  <div class="list-main">
                    <strong>{b.title}</strong>
                    <div class="muted">{b.authors.join(', ')}</div>
                    <div class="tiny muted">
                      {[
                        STATUS_LABELS[b.status],
                        collectionOf(b) === 'borrowed' && 'Borrowed',
                        b.series && `${b.series}${b.seriesIndex ? ` #${b.seriesIndex}` : ''}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <Badge resolved={loc} row={b.location?.row} />
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {moving && (
        <MoveDialog
          bookIds={[...selected]}
          onClose={() => setMoving(false)}
          onMoved={() => {
            setMoving(false);
            setSelecting(false);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}
