import { useLive } from '../../data/hooks';
import type { Book } from '../../data/models';
import { joinQueue, leaveQueue } from '../../data/reading';
import { liveBooks } from '../../data/store';
import { QUEUE_SOFT_LIMIT, queueFor } from './logic';

export function QueueButton({ book }: { book: Book }) {
  const books = useLive(liveBooks);
  if (!books || book.status === 'read' || book.status === 'reading') return null;
  const count = queueFor(books, book.category).length;
  const label = book.category === 'fiction' ? 'fiction' : 'nonfiction';

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
      <button onClick={() => joinQueue(book)}>＋ Add to Up Next</button>
      {count >= QUEUE_SOFT_LIMIT && (
        <span class="warn-text tiny">
          The {label} queue already has {count} (limit {QUEUE_SOFT_LIMIT}).
        </span>
      )}
    </div>
  );
}
