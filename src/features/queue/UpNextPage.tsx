import { useMemo, useState } from 'preact/hooks';
import { Badge, Cover, Empty } from '../../app/ui';
import { useLive } from '../../data/hooks';
import { type Book, COLLECTION_LABELS, collectionOf } from '../../data/models';
import { joinQueue, setRadar } from '../../data/reading';
import { liveBooks, loadLocations } from '../../data/store';
import { type SortKey, sortBooks } from '../library/query';
import { type ResolvedShelf, resolveShelves } from '../locations/util';
import { effectiveWordCount } from '../reading/logic';
import { useCalibration } from '../reading/useCalibration';
import { compact } from '../stats/charts';
import { findPlaceholderHref } from './QueueButton';
import { UpNextGallery } from './UpNextGallery';

const PREFS_KEY = 'shelf-index.upnext-page';

interface Prefs {
  sort: SortKey;
  category: '' | 'fiction' | 'nonfiction';
}

function loadPrefs(): Prefs {
  try {
    return { sort: 'added', category: '', ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { sort: 'added', category: '' };
  }
}

/**
 * The Up Next tab: the queue, then books pinned "on the radar", then everything marked To Read,
 * owned or not.
 */
export function UpNextPage() {
  const books = useLive(liveBooks);
  const locs = useLive(loadLocations);
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
  const resolved = useMemo(() => (locs ? resolveShelves(locs) : new Map<string, ResolvedShelf>()), [locs]);

  if (!books || !locs || !calibration) return <div class="page" />;

  const toRead = books.filter((b) => b.status === 'to-read' && (!prefs.category || b.category === prefs.category));
  const radar = toRead.filter((b) => b.radarAt && !b.queue.inQueue).sort((a, b) => a.radarAt!.localeCompare(b.radarAt!));
  const rest = sortBooks(
    toRead.filter((b) => !b.radarAt && !b.queue.inQueue),
    prefs.sort,
    resolved,
  );

  const row = (b: Book) => {
    const loc = b.location ? resolved.get(b.location.shelfId) : undefined;
    const words = effectiveWordCount(b, calibration);
    const collection = collectionOf(b);
    return (
      <li key={b.id}>
        <a href={`#/book/${b.id}`}>
          <Cover book={b} size="sm" />
          <div class="list-main">
            <strong>{b.title}</strong>
            <div class="muted">{b.authors.join(', ')}</div>
            <div class="tiny muted">
              {[
                b.seriesPlaceholder ? 'Next in series · not in your library yet' : collection !== 'owned' && COLLECTION_LABELS[collection],
                b.series && !b.seriesPlaceholder && `${b.series}${b.seriesIndex ? ` #${b.seriesIndex}` : ''}`,
                words && `${compact(words.value)} words`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <Badge resolved={loc} row={b.location?.row} />
        </a>
        <div class="row-actions">
          {b.seriesPlaceholder ? (
            <a class="button small primary" href={findPlaceholderHref(b)}>
              Find
            </a>
          ) : (
            <>
              <button
                class={`small icon-button${b.radarAt ? ' active' : ''}`}
                onClick={() => setRadar(b, !b.radarAt)}
                aria-label={b.radarAt ? `Unpin ${b.title} from the radar` : `Put ${b.title} on the radar`}
                title={b.radarAt ? 'On the radar (tap to unpin)' : 'Put on the radar'}
              >
                📌
              </button>
              {collection !== 'wishlist' && (
                <button class="small" onClick={() => joinQueue(b)} title="Add to the Up Next queue">
                  ＋ Queue
                </button>
              )}
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div class="page">
      <div class="page-head">
        <h1>Up Next</h1>
        <div class="actions">
          <a class="button" href="#/pick">
            Pick next
          </a>
          <a class="button" href="#/discover">
            Wishlist
          </a>
        </div>
      </div>

      <UpNextGallery books={books} resolved={resolved} heading="Queue" inUpNextTab />

      <div class="filter-row">
        <div class="segmented">
          {([
            ['', 'All'],
            ['fiction', 'Fiction'],
            ['nonfiction', 'Nonfiction'],
          ] as const).map(([v, label]) => (
            <button key={v} class={prefs.category === v ? 'active' : ''} onClick={() => setPrefs({ category: v })}>
              {label}
            </button>
          ))}
        </div>
        <select value={prefs.sort} aria-label="Sort" onChange={(e) => setPrefs({ sort: e.currentTarget.value as SortKey })}>
          <option value="added">Recently added</option>
          <option value="title">Title</option>
          <option value="author">Author</option>
          <option value="length">Length</option>
          <option value="location">Location</option>
        </select>
      </div>

      {radar.length > 0 && (
        <section>
          <h2>
            On the radar <span class="muted">({radar.length})</span>
          </h2>
          <ul class="list upnext-list">{radar.map(row)}</ul>
        </section>
      )}

      <section>
        <h2>
          To Read <span class="muted">({rest.length})</span>
        </h2>
        {rest.length === 0 && radar.length === 0 ? (
          <Empty>
            Nothing marked To Read. Set a book's Reading status to To Read, or pin it to the radar with 📌, and it shows up here.
          </Empty>
        ) : rest.length === 0 ? (
          <p class="muted">Everything else To Read is queued or on the radar.</p>
        ) : (
          <ul class="list upnext-list">{rest.map(row)}</ul>
        )}
      </section>
    </div>
  );
}
