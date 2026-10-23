import { useMemo, useState } from 'preact/hooks';
import { Cover, Empty } from '../../app/ui';
import { useLive } from '../../data/hooks';
import type { Book } from '../../data/models';
import { liveBooks, loadLocations } from '../../data/store';
import { sortBooks } from '../library/query';
import { MoveDialog } from './MoveDialog';
import { resolveShelves } from './util';

/** Everything on one shelf, front and back rows listed separately. */
export function ShelfView({ id }: { id: string }) {
  const locs = useLive(loadLocations);
  const books = useLive(liveBooks);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<string[] | null>(null);
  const resolved = useMemo(() => (locs ? resolveShelves(locs) : new Map()), [locs]);

  if (!locs || !books) return <div class="page" />;
  const here = resolved.get(id);
  if (!here) {
    return (
      <div class="page">
        <Empty>
          That shelf doesn't exist (it may have been removed). <a href="#/shelves">All shelves</a>
        </Empty>
      </div>
    );
  }

  const onShelf = sortBooks(
    books.filter((b) => b.location?.shelfId === id),
    'author',
    resolved,
  );
  const front = onShelf.filter((b) => b.location?.row !== 'back');
  const back = onShelf.filter((b) => b.location?.row === 'back');

  const toggle = (bookId: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });

  const rowList = (label: string, list: Book[]) => (
    <section>
      <h2>
        {label} <span class="muted">({list.length})</span>
      </h2>
      {list.length === 0 ? (
        <p class="muted">Empty.</p>
      ) : (
        <ul class="list">
          {list.map((b) => (
            <li key={b.id} class={selected.has(b.id) ? 'selected' : ''}>
              <label class="check list-check">
                <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} />
              </label>
              <a href={`#/book/${b.id}`}>
                <Cover book={b} size="sm" />
                <div class="list-main">
                  <strong>{b.title}</strong>
                  <div class="muted">{b.authors.join(', ')}</div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div class="page">
      <p>
        <a href="#/shelves">‹ Shelves</a>
      </p>
      <div class="page-head">
        <h1>
          <span class="badge badge-lg">{here.code}</span>
        </h1>
        <div class="actions">
          <a class="button" href={`#/shelve?shelf=${id}`}>
            Shelve books here
          </a>
        </div>
      </div>
      <p class="muted">
        {here.room.name}, bookcase {here.bookcase.number}
        {here.bookcase.name && ` (${here.bookcase.name})`}, shelf {here.shelf.number} from the top
      </p>

      {rowList(here.shelf.hasBackRow ? 'Front row' : 'Books', front)}
      {(here.shelf.hasBackRow || back.length > 0) && rowList('Back row', back)}

      <div class="form-actions sticky-actions">
        <button disabled={onShelf.length === 0} onClick={() => setMoving(onShelf.map((b) => b.id))}>
          Move whole shelf
        </button>
        <button class="primary" disabled={selected.size === 0} onClick={() => setMoving([...selected])}>
          Move selected ({selected.size})
        </button>
      </div>

      {moving && (
        <MoveDialog
          bookIds={moving}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}
