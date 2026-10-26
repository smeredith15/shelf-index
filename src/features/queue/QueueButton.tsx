import { useLive } from '../../data/hooks';
import { type Book, collectionOf } from '../../data/models';
import { joinQueue, leaveQueue, setRadar } from '../../data/reading';
import { liveBooks } from '../../data/store';
import { QUEUE_SOFT_LIMIT, queueFor } from './logic';

/** Where a series placeholder's "Find this book" goes: a search that replaces the placeholder. */
export function findPlaceholderHref(book: Book): string {
  const q = [book.title.replace(/#/g, ''), book.authors[0] ?? ''].join(' ').trim();
  return `#/add?mode=search&q=${encodeURIComponent(q)}&replace=${book.id}`;
}

/** Up Next and "on the radar" controls for a book's page. */
export function QueueButton({ book }: { book: Book }) {
  const books = useLive(liveBooks);
  if (!books || book.status === 'read' || book.status === 'reading') return null;

  if (book.seriesPlaceholder) {
    return (
      <div class="queue-button in-queue">
        <span>A placeholder for the next book in {book.series}.</span>
        <a class="button small primary" href={findPlaceholderHref(book)}>
          Find this book
        </a>
      </div>
    );
  }

  const count = queueFor(books, book.category).length;
  const label = book.category === 'fiction' ? 'fiction' : 'nonfiction';
  // Up Next is a shelf of books you have; wishlist books can still go on the radar.
  const queueable = collectionOf(book) !== 'wishlist';

  if (book.queue.inQueue) {
    return (
      <div class="queue-button in-queue">
        <span>
          Up Next: <strong>#{book.queue.position}</strong> of {count} {label}
        </span>
        <a href="#/queue">Reorder</a>
        <button class="small" onClick={() => leaveQueue(book)}>
          Remove
        </button>
      </div>
    );
  }
  return (
    <div class="queue-button">
      {queueable && <button onClick={() => joinQueue(book)}>＋ Add to Up Next</button>}
      {book.radarAt ? (
        <button class="active" onClick={() => setRadar(book, false)} title="Unpin from the top of your To Read list">
          📌 On the radar
        </button>
      ) : (
        <button onClick={() => setRadar(book, true)} title="Pin to the top of your To Read list">
          📌 Put on the radar
        </button>
      )}
      {queueable && count >= QUEUE_SOFT_LIMIT && (
        <span class="warn-text tiny">
          The {label} queue already has {count} (limit {QUEUE_SOFT_LIMIT}).
        </span>
      )}
    </div>
  );
}
