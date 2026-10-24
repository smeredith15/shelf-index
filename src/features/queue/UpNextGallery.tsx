import { useMemo, useState } from 'preact/hooks';
import { Cover } from '../../app/ui';
import type { Book, Category } from '../../data/models';
import type { ResolvedShelf } from '../locations/util';
import { QUEUE_SOFT_LIMIT, queueFor } from './logic';

export type GalleryLayout = 'rows' | 'toggle';
export const LAYOUT_KEY = 'shelf-index.upnext-layout';

export function loadLayout(): GalleryLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'toggle' ? 'toggle' : 'rows';
  } catch {
    return 'rows';
  }
}

/** Horizontally scrolling Up Next queue for the top of the home screen. */
export function UpNextGallery({ books, resolved }: { books: Book[]; resolved: Map<string, ResolvedShelf> }) {
  const [layout] = useState(loadLayout);
  const [active, setActive] = useState<Category>('fiction');
  const queues = useMemo(
    () => ({ fiction: queueFor(books, 'fiction'), nonfiction: queueFor(books, 'nonfiction') }),
    [books],
  );
  if (queues.fiction.length + queues.nonfiction.length === 0) {
    return (
      <p class="tiny muted upnext-empty">
        Up Next is empty. Open a To Read book and tap <em>Add to Up Next</em>.
      </p>
    );
  }

  const row = (category: Category, showTitle: boolean) => {
    const list = queues[category];
    return (
      <div class="upnext-row" key={category}>
        {showTitle && (
          <h3>
            {category === 'fiction' ? 'Fiction' : 'Nonfiction'}{' '}
            <span class={list.length > QUEUE_SOFT_LIMIT ? 'warn-text' : 'muted'}>
              {list.length}/{QUEUE_SOFT_LIMIT}
            </span>
          </h3>
        )}
        {list.length === 0 ? (
          <p class="tiny muted">Nothing queued.</p>
        ) : (
          <div class="upnext-scroll">
            {list.map((b, i) => (
              <a key={b.id} href={`#/book/${b.id}`} class="upnext-item">
                <span class="upnext-pos">{i + 1}</span>
                <Cover book={b} resolved={b.location ? resolved.get(b.location.shelfId) : undefined} />
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section class="upnext">
      <div class="upnext-head">
        <h2>Up Next</h2>
        {layout === 'toggle' && (
          <div class="segmented">
            {(['fiction', 'nonfiction'] as Category[]).map((c) => (
              <button key={c} class={active === c ? 'active' : ''} onClick={() => setActive(c)}>
                {c === 'fiction' ? 'Fiction' : 'Nonfiction'} {queues[c].length}
              </button>
            ))}
          </div>
        )}
        <a href="#/pick">Pick next</a>
        <a href="#/queue">Edit</a>
      </div>
      {layout === 'rows' ? [row('fiction', true), row('nonfiction', true)] : row(active, false)}
    </section>
  );
}
