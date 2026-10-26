import { useMemo } from 'preact/hooks';
import { Cover, Empty } from '../../app/ui';
import { useLive } from '../../data/hooks';
import { collectionOf, withCollection } from '../../data/models';
import { liveBooks, saveBook } from '../../data/store';
import { sortBooks } from '../library/query';

/**
 * Books you don't have yet. The wishlist is where books shared in from Goodreads or StoryGraph
 * will land; recommendations come later, from the sources listed below.
 */
export function DiscoverPage() {
  const books = useLive(liveBooks);
  const wishlist = useMemo(
    () => (books ? sortBooks(books.filter((b) => collectionOf(b) === 'wishlist' && !b.seriesPlaceholder), 'added', new Map()) : []),
    [books],
  );
  if (!books) return <div class="page" />;

  return (
    <div class="page">
      <div class="page-head">
        <h1>Discover</h1>
        <a class="button primary" href="#/add?mode=search&collection=wishlist">
          ＋ Add to wishlist
        </a>
      </div>

      <section>
        <h2>
          Wishlist <span class="muted">({wishlist.length})</span>
        </h2>
        {wishlist.length === 0 ? (
          <Empty>
            Books you want but don't have yet. Add one here, or set a book's status to Wishlist. Books shared in from Goodreads or
            StoryGraph will arrive here too.
          </Empty>
        ) : (
          <ul class="list wishlist">
            {wishlist.map((b) => (
              <li key={b.id}>
                <a href={`#/book/${b.id}`}>
                  <Cover book={b} size="sm" />
                  <div class="list-main">
                    <strong>{b.title}</strong>
                    <div class="muted">{b.authors.join(', ')}</div>
                  </div>
                </a>
                <div class="wishlist-actions">
                  <button class="small" onClick={() => saveBook(withCollection(b, 'owned'))} title="Move it into the library as owned">
                    Got it
                  </button>
                  <button class="small" onClick={() => saveBook(withCollection(b, 'borrowed'))} title="Move it into the library as borrowed">
                    Borrowed
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="card discover-later">
        <h2>Recommendations</h2>
        <p class="muted">Coming later, best effort:</p>
        <ul>
          <li>More by authors you've read, and the rest of series you've started (Open Library)</li>
          <li>Browsing by subject (Open Library)</li>
          <li>New York Times bestseller lists (needs a free API key)</li>
        </ul>
        <p class="tiny muted">Goodreads and StoryGraph don't offer recommendation APIs, so nothing comes from them directly.</p>
      </section>
    </div>
  );
}
