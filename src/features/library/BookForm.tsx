import { useState } from 'preact/hooks';
import { Badge, Cover, Field } from '../../app/ui';
import { setCoverFromFile, setCoverFromUrl } from '../../data/covers';
import {
  type Book,
  type Category,
  FORMAT_LABELS,
  type Format,
  STATUS_LABELS,
  type Status,
} from '../../data/models';
import { LocationPicker } from '../locations/LocationPicker';
import type { ResolvedShelf } from '../locations/util';
import { CoverPicker } from './CoverPicker';

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
const num = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? null : Number(s));

/** Every field of a book, editable. Used both for new books and for editing existing ones. */
export function BookForm({
  initial,
  coverUrls = [],
  workKey = null,
  resolved,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Book;
  coverUrls?: string[];
  workKey?: string | null;
  resolved?: Map<string, ResolvedShelf>;
  submitLabel: string;
  onSubmit: (book: Book) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [book, setBook] = useState<Book>(initial);
  const [authors, setAuthors] = useState(initial.authors.join(', '));
  const [tags, setTags] = useState(initial.tags.join(', '));
  const [subjects, setSubjects] = useState(initial.subjects.join(', '));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Book>(key: K, value: Book[K]) => setBook((b) => ({ ...b, [key]: value }));

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!book.title.trim()) return;
    setBusy(true);
    try {
      await onSubmit({
        ...book,
        title: book.title.trim(),
        authors: list(authors),
        tags: list(tags),
        subjects: list(subjects),
      });
    } finally {
      setBusy(false);
    }
  };

  const loc = book.location && resolved?.get(book.location.shelfId);

  return (
    <form class="book-form" onSubmit={submit}>
      <div class="book-form-top">
        <button type="button" class="cover-button" onClick={() => setPicking(true)} title="Change cover">
          <Cover book={book} size="lg" />
          <span class="cover-change">Change cover</span>
        </button>
        <div class="book-form-main">
          <Field label="Title">
            <input value={book.title} required onInput={(e) => set('title', e.currentTarget.value)} />
          </Field>
          <Field label="Subtitle">
            <input value={book.subtitle ?? ''} onInput={(e) => set('subtitle', e.currentTarget.value || null)} />
          </Field>
          <Field label="Authors" hint="Separate with commas">
            <input value={authors} onInput={(e) => setAuthors(e.currentTarget.value)} />
          </Field>
          <div class="row-2">
            <Field label="Status">
              <select value={book.status} onChange={(e) => set('status', e.currentTarget.value as Status)}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select value={book.category} onChange={(e) => set('category', e.currentTarget.value as Category)}>
                <option value="fiction">Fiction</option>
                <option value="nonfiction">Nonfiction</option>
              </select>
            </Field>
          </div>
          <label class="check">
            <input type="checkbox" checked={book.owned} onChange={(e) => set('owned', e.currentTarget.checked)} />
            Owned
          </label>
        </div>
      </div>

      <fieldset>
        <legend>
          Location {loc && <Badge resolved={loc} row={book.location?.row} />}
        </legend>
        <LocationPicker value={book.location} onChange={(l) => set('location', l)} />
        {book.location && (
          <button type="button" class="link" onClick={() => set('location', null)}>
            Clear location
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend>Details</legend>
        <div class="row-2">
          <Field label="Series">
            <input value={book.series ?? ''} onInput={(e) => set('series', e.currentTarget.value || null)} />
          </Field>
          <Field label="Number in series">
            <input
              inputMode="decimal"
              value={book.seriesIndex ?? ''}
              onInput={(e) => set('seriesIndex', num(e.currentTarget.value))}
            />
          </Field>
        </div>
        <div class="row-2">
          <Field label="ISBN-13">
            <input
              inputMode="numeric"
              value={book.isbn13 ?? ''}
              onInput={(e) => set('isbn13', e.currentTarget.value.replace(/[^0-9]/g, '') || null)}
            />
          </Field>
          <Field label="Format">
            <select
              value={book.format ?? ''}
              onChange={(e) => set('format', (e.currentTarget.value || null) as Format | null)}
            >
              <option value="">Unknown</option>
              {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div class="row-2">
          <Field label="Publisher">
            <input value={book.publisher ?? ''} onInput={(e) => set('publisher', e.currentTarget.value || null)} />
          </Field>
          <Field label="Year">
            <input inputMode="numeric" value={book.pubYear ?? ''} onInput={(e) => set('pubYear', num(e.currentTarget.value))} />
          </Field>
        </div>
        <div class="row-2">
          <Field label="Pages">
            <input inputMode="numeric" value={book.pageCount ?? ''} onInput={(e) => set('pageCount', num(e.currentTarget.value))} />
          </Field>
          <Field label="Body pages" hint="Excluding front and back matter">
            <input inputMode="numeric" value={book.bodyPages ?? ''} onInput={(e) => set('bodyPages', num(e.currentTarget.value))} />
          </Field>
        </div>
        <Field label="Tags" hint="Separate with commas">
          <input value={tags} onInput={(e) => setTags(e.currentTarget.value)} />
        </Field>
        <Field label="Subjects">
          <input value={subjects} onInput={(e) => setSubjects(e.currentTarget.value)} />
        </Field>
        <Field label="Rating">
          <div class="stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                class={book.rating !== null && book.rating >= n ? 'on' : ''}
                onClick={() => set('rating', book.rating === n ? null : n)}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
              >
                ★
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <textarea rows={4} value={book.notes} onInput={(e) => set('notes', e.currentTarget.value)} />
        </Field>
      </fieldset>

      <div class="form-actions">
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" class="primary" disabled={busy || !book.title.trim()}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>

      {picking && (
        <CoverPicker
          initialUrls={[...new Set([...coverUrls, ...(book.coverUrl ? [book.coverUrl] : [])])]}
          workKey={workKey}
          book={{ isbn13: book.isbn13, title: book.title, authors: list(authors) }}
          onClose={() => setPicking(false)}
          onPickUrl={async (url) => {
            setPicking(false);
            setBook(await setCoverFromUrl(book, url));
          }}
          onPickFile={async (file) => {
            setPicking(false);
            setBook(await setCoverFromFile(book, file));
          }}
        />
      )}
    </form>
  );
}
