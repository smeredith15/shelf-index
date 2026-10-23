import type { Book, Category } from '../../data/models';

export const QUEUE_SOFT_LIMIT = 10;

/** Books queued in a category, in queue order. */
export function queueFor(books: Book[], category: Category): Book[] {
  return books
    .filter((b) => !b.deleted && b.queue.inQueue && b.category === category)
    .sort((a, b) => (a.queue.position ?? 0) - (b.queue.position ?? 0) || a.addedAt.localeCompare(b.addedAt));
}

/** Moves the item at `from` to `to`, returning a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/** Books whose position must change so the given order reads 1, 2, 3… */
export function renumber(ordered: Book[]): Book[] {
  return ordered
    .map((b, i): Book | null =>
      b.queue.position === i + 1 && b.queue.inQueue ? null : { ...b, queue: { inQueue: true, position: i + 1 } },
    )
    .filter((b): b is Book => !!b);
}
