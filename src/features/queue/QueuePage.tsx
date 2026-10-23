import { useEffect, useRef, useState } from 'preact/hooks';
import { Cover } from '../../app/ui';
import { useLive } from '../../data/hooks';
import type { Book, Category } from '../../data/models';
import { leaveQueue, reorderQueue } from '../../data/reading';
import { liveBooks } from '../../data/store';
import { type GalleryLayout, LAYOUT_KEY, loadLayout } from './UpNextGallery';
import { QUEUE_SOFT_LIMIT, moveItem, queueFor } from './logic';

export function QueuePage() {
  const books = useLive(liveBooks);
  const [layout, setLayout] = useState<GalleryLayout>(loadLayout);
  if (!books) return <div class="page" />;

  return (
    <div class="page">
      <p>
        <a href="#/">‹ Library</a>
      </p>
      <div class="page-head">
        <h1>Up Next</h1>
        <div class="segmented" title="How the home screen shows the queue">
          {(['rows', 'toggle'] as GalleryLayout[]).map((l) => (
            <button
              key={l}
              class={layout === l ? 'active' : ''}
              onClick={() => {
                setLayout(l);
                try {
                  localStorage.setItem(LAYOUT_KEY, l);
                } catch {
                  /* preference only */
                }
              }}
            >
              {l === 'rows' ? 'Two rows' : 'One row'}
            </button>
          ))}
        </div>
      </div>
      <p class="muted">Drag ☰ to reorder. Books leave the queue when you start reading them.</p>
      {(['fiction', 'nonfiction'] as Category[]).map((c) => (
        <QueueList key={c} category={c} books={queueFor(books, c)} />
      ))}
    </div>
  );
}

function QueueList({ category, books }: { category: Category; books: Book[] }) {
  // Local order while dragging; reset whenever the stored queue changes.
  const [order, setOrder] = useState(books);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; lastY: number; height: number } | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const key = books.map((b) => `${b.id}:${b.queue.position}`).join();
  useEffect(() => setOrder(books), [key]);

  const onPointerDown = (e: PointerEvent, id: string) => {
    const li = (e.currentTarget as HTMLElement).closest('li')!;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id, lastY: e.clientY, height: li.getBoundingClientRect().height };
    setDragId(id);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.lastY;
    // Swap with a neighbour once the pointer has moved past half a row.
    if (Math.abs(dy) < d.height / 2) return;
    const list = orderRef.current;
    const from = list.findIndex((b) => b.id === d.id);
    const to = from + (dy > 0 ? 1 : -1);
    if (to < 0 || to >= list.length) return;
    d.lastY += dy > 0 ? d.height : -d.height;
    setOrder(moveItem(list, from, to));
  };

  const onPointerUp = async () => {
    if (!drag.current) return;
    drag.current = null;
    setDragId(null);
    await reorderQueue(orderRef.current);
  };

  return (
    <section>
      <h2>
        {category === 'fiction' ? 'Fiction' : 'Nonfiction'}{' '}
        <span class={books.length > QUEUE_SOFT_LIMIT ? 'warn-text' : 'muted'}>
          ({books.length}/{QUEUE_SOFT_LIMIT})
        </span>
      </h2>
      {books.length > QUEUE_SOFT_LIMIT && (
        <p class="warn-text tiny">That's more than {QUEUE_SOFT_LIMIT}. Fine, but consider trimming.</p>
      )}
      {order.length === 0 ? (
        <p class="muted">Nothing queued.</p>
      ) : (
        <ul class="list queue-list">
          {order.map((b, i) => (
            <li key={b.id} class={dragId === b.id ? 'dragging' : ''}>
              <span
                class="drag-handle"
                aria-label="Drag to reorder"
                onPointerDown={(e) => onPointerDown(e, b.id)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                ☰
              </span>
              <span class="queue-pos">{i + 1}</span>
              <a href={`#/book/${b.id}`}>
                <Cover book={b} size="sm" />
                <div class="list-main">
                  <strong>{b.title}</strong>
                  <div class="muted">{b.authors.join(', ')}</div>
                </div>
              </a>
              <button class="ghost small" onClick={() => leaveQueue(b)} aria-label={`Remove ${b.title} from Up Next`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
