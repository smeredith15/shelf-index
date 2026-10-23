import { useMemo, useState } from 'preact/hooks';
import { navigate } from '../../app/router';
import { Empty } from '../../app/ui';
import { db } from '../../data/db';
import { useLive } from '../../data/hooks';
import { deleteBook, loadLocations, saveBook } from '../../data/store';
import { resolveShelves } from '../locations/util';
import { BookForm } from './BookForm';

export function BookDetail({ id }: { id: string }) {
  const book = useLive(() => db.books.get(id).then((b) => b ?? null), [id]);
  const locs = useLive(loadLocations);
  const resolved = useMemo(() => (locs ? resolveShelves(locs) : new Map()), [locs]);
  const [saved, setSaved] = useState(false);

  if (book === undefined || !locs) return <div class="page" />;
  if (book === null || book.deleted) {
    return (
      <div class="page">
        <Empty>
          This book isn't in your library. <a href="#/">Back to library</a>
        </Empty>
      </div>
    );
  }

  return (
    <div class="page">
      <p>
        <a href="#/" onClick={(e) => history.length > 1 && (e.preventDefault(), history.back())}>
          ‹ Library
        </a>
      </p>
      {/* key: re-mount when another device's sync replaces this record */}
      <BookForm
        key={book.updatedAt}
        initial={book}
        resolved={resolved}
        submitLabel="Save"
        onSubmit={async (b) => {
          await saveBook(b);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }}
      />
      {saved && <div class="toast">Saved</div>}
      <p class="tiny muted">
        Added {new Date(book.addedAt).toLocaleDateString()} · Last changed {new Date(book.updatedAt).toLocaleString()}
      </p>
      <button
        class="danger"
        onClick={async () => {
          if (!confirm(`Delete “${book.title}” from your library?`)) return;
          await deleteBook(book.id);
          navigate('/', true);
        }}
      >
        Delete book
      </button>
    </div>
  );
}
