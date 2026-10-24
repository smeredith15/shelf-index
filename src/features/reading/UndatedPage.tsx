import { useState } from 'preact/hooks';
import { Cover, Empty } from '../../app/ui';
import { useLive } from '../../data/hooks';
import { liveSessions } from '../../data/reading';
import { liveBooks, saveBook } from '../../data/store';
import { sortBooks } from '../library/query';
import { undatedReads } from './undated';

/** Read books with no dates: add the dates, or dismiss the ones you can't remember. */
export function UndatedPage() {
  const books = useLive(liveBooks);
  const sessions = useLive(liveSessions);
  const [showDismissed, setShowDismissed] = useState(false);
  if (!books || !sessions) return <div class="page" />;
  const { missing, dismissed } = undatedReads(books, sessions);

  return (
    <div class="page">
      <p>
        <a href="#/stats">‹ Stats</a>
      </p>
      <h1>Read books with no dates</h1>
      <p class="muted">
        Stats only count reads with dates. Open a book to add a past read, or choose <em>Don't know</em> if you can't remember
        when you read it.
      </p>
      {missing.length === 0 ? (
        <Empty>Every read book has dates, or has been marked as unknown.</Empty>
      ) : (
        <ul class="list undated-list">
          {sortBooks(missing, 'title', new Map()).map((b) => (
            <li key={b.id}>
              <a href={`#/book/${b.id}`}>
                <Cover book={b} size="sm" />
                <div class="list-main">
                  <strong>{b.title}</strong>
                  <div class="muted">{b.authors.join(', ')}</div>
                </div>
              </a>
              <div class="wishlist-actions">
                <a class="button small" href={`#/book/${b.id}`}>
                  Add dates
                </a>
                <button class="small" onClick={() => saveBook({ ...b, datesUnknown: true })}>
                  Don't know
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {dismissed.length > 0 && (
        <section>
          <button class="link" onClick={() => setShowDismissed(!showDismissed)}>
            {showDismissed ? 'Hide' : 'Show'} {dismissed.length} marked "Don't know"
          </button>
          {showDismissed && (
            <ul class="list undated-list">
              {sortBooks(dismissed, 'title', new Map()).map((b) => (
                <li key={b.id}>
                  <a href={`#/book/${b.id}`}>
                    <Cover book={b} size="sm" />
                    <div class="list-main">
                      <strong>{b.title}</strong>
                      <div class="muted">{b.authors.join(', ')}</div>
                    </div>
                  </a>
                  <div class="wishlist-actions">
                    <button class="small" onClick={() => saveBook({ ...b, datesUnknown: false })}>
                      Restore
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
