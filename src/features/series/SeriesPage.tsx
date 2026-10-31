import { useEffect, useMemo, useState } from 'preact/hooks';
import { navigate } from '../../app/router';
import { useReaders } from '../../app/readers';
import { Cover, Empty } from '../../app/ui';
import { useLive } from '../../data/hooks';
import { type Book, COLLECTION_LABELS, STATUS_LABELS, collectionOf } from '../../data/models';
import { liveBooks, saveBooks } from '../../data/store';
import { type SeriesEntry, findSeriesForBook, seriesEntries } from '../../lookup/wikidata';
import { findByTitle, seriesKey } from '../reading/series';
import { findPlaceholderHref } from '../queue/QueueButton';

export function seriesHref(name: string): string {
  return `#/series/${encodeURIComponent(name)}`;
}

interface Row {
  ordinal: number | null;
  title: string;
  year: number | null;
  authors: string[];
  /** The library's copy, if any. */
  book?: Book;
  /** The library has this title but not filed under this series (or without a number). */
  needsFiling?: boolean;
}

/** Every book in a series, like Goodreads: Wikidata's list matched against the library. */
export function SeriesPage({ name }: { name: string }) {
  const books = useLive(liveBooks);
  const { readByMe } = useReaders();
  const [entries, setEntries] = useState<SeriesEntry[] | null | 'loading'>('loading');
  const [rename, setRename] = useState<string | null>(null);
  const key = seriesKey(name);

  const members = useMemo(
    () => (books ?? []).filter((b) => b.series && seriesKey(b.series) === key).sort((a, b) => (a.seriesIndex ?? Infinity) - (b.seriesIndex ?? Infinity)),
    [books, key],
  );
  // Look the series up from any real book in it.
  const probe = members.find((b) => !b.seriesPlaceholder);
  useEffect(() => {
    if (!books) return;
    if (!probe) {
      setEntries(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const match = await findSeriesForBook(probe.title, probe.authors);
      const list = match ? await seriesEntries(match.seriesId) : null;
      if (!cancelled) setEntries(list && list.length ? list : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [books === undefined, probe?.id]);

  if (!books) return <div class="page" />;

  const rows: Row[] = [];
  const used = new Set<string>();
  if (entries && entries !== 'loading') {
    for (const e of entries) {
      const inSeries = findByTitle(members, e.title, e.authors);
      const elsewhere = inSeries ? undefined : findByTitle(books, e.title, e.authors);
      const placeholder = !inSeries && !elsewhere ? members.find((m) => m.seriesPlaceholder && m.seriesIndex === e.ordinal) : undefined;
      const book = inSeries ?? elsewhere ?? placeholder;
      if (book) used.add(book.id);
      rows.push({
        ordinal: e.ordinal,
        title: e.title,
        year: e.year,
        authors: e.authors,
        book,
        needsFiling: !!book && !book.seriesPlaceholder && (!inSeries || book.seriesIndex !== e.ordinal),
      });
    }
  }
  const extras = members.filter((b) => !used.has(b.id));
  const toFile = rows.filter((r) => r.needsFiling && r.book && r.ordinal !== null);

  const fileRows = async (list: Row[]) => {
    await saveBooks(list.map((r) => ({ ...r.book!, series: r.book!.series && seriesKey(r.book!.series) === key ? r.book!.series : name, seriesIndex: r.ordinal })));
  };

  const statusLine = (b: Book) => {
    const mine = b.status === 'read' || readByMe.has(b.id);
    return [
      collectionOf(b) !== 'owned' && COLLECTION_LABELS[collectionOf(b)],
      STATUS_LABELS[b.status],
      mine && b.status !== 'read' && 'Read before',
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const row = (r: Row, i: number) => (
    <li key={r.book?.id ?? `${r.ordinal}-${i}`} class={r.book ? '' : 'series-missing'}>
      <span class="series-num">{r.ordinal ?? '–'}</span>
      {r.book && !r.book.seriesPlaceholder ? (
        <a href={`#/book/${r.book.id}`}>
          <Cover book={r.book} size="sm" />
          <div class="list-main">
            <strong>{r.book.title}</strong>
            <div class="tiny muted">
              {[r.year, statusLine(r.book)].filter(Boolean).join(' · ') || 'In your library'}
            </div>
          </div>
        </a>
      ) : (
        <div class="series-missing-main">
          <div class="cover cover-sm series-gap" />
          <div class="list-main">
            <strong>{r.title}</strong>
            <div class="tiny muted">{[r.year, r.book ? 'Placeholder on To Read' : 'Not in your library'].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      )}
      <div class="row-actions">
        {r.book?.seriesPlaceholder ? (
          <a class="button small primary" href={findPlaceholderHref(r.book)}>
            Find
          </a>
        ) : !r.book ? (
          <a class="button small" href={`#/add?mode=search&q=${encodeURIComponent(`${r.title} ${r.authors[0] ?? ''}`.trim())}`}>
            Add
          </a>
        ) : r.needsFiling && r.ordinal !== null ? (
          <button class="small" onClick={() => fileRows([r])} title="File this book under this series and number">
            Set as #{r.ordinal}
          </button>
        ) : null}
      </div>
    </li>
  );

  return (
    <div class="page">
      <p>
        <a href="#/series">‹ All series</a>
      </p>
      <div class="page-head">
        <h1>{name}</h1>
      </div>

      {entries === 'loading' ? (
        <p class="muted">Looking up the series…</p>
      ) : entries ? (
        <>
          <p class="tiny muted">
            {rows.length} books, from Wikidata · {rows.filter((r) => r.book && !r.book.seriesPlaceholder).length} in your library
          </p>
          {toFile.length > 1 && (
            <p class="notice">
              {toFile.length} books in your library aren't filed under this series and number.{' '}
              <button class="link" onClick={() => fileRows(toFile)}>
                Update them all
              </button>
            </p>
          )}
          <ul class="list series-list">{rows.map(row)}</ul>
        </>
      ) : (
        <p class="tiny muted">
          Wikidata doesn't list this series{probe ? '' : ' (no book to look it up by)'}, so these are the books in your library.
        </p>
      )}

      {extras.length > 0 && (
        <section>
          {entries && entries !== 'loading' && <h2>Also in your library</h2>}
          <ul class="list series-list">
            {extras.map((b, i) => row({ ordinal: b.seriesIndex, title: b.title, year: b.pubYear, authors: b.authors, book: b }, i))}
          </ul>
        </section>
      )}
      {members.length === 0 && <Empty>No books in your library are in this series.</Empty>}

      {members.length > 0 && (
        <form
          class="row-inline series-rename"
          onSubmit={async (e) => {
            e.preventDefault();
            const next = (rename ?? '').trim();
            if (!next || next === name) return;
            await saveBooks(members.map((b) => ({ ...b, series: next })));
            navigate(seriesHref(next).slice(1), true);
          }}
        >
          <input value={rename ?? name} aria-label="Series name" onInput={(e) => setRename(e.currentTarget.value)} />
          <button disabled={rename === null || !rename.trim() || rename.trim() === name}>Rename for all {members.length}</button>
        </form>
      )}
    </div>
  );
}

/** Every series in the library, with how far through each you are. */
export function SeriesIndexPage() {
  const books = useLive(liveBooks);
  const { readByMe } = useReaders();
  if (!books) return <div class="page" />;
  const groups = new Map<string, { names: Map<string, number>; books: Book[] }>();
  for (const b of books) {
    if (!b.series?.trim()) continue;
    const k = seriesKey(b.series);
    const g: { names: Map<string, number>; books: Book[] } = groups.get(k) ?? { names: new Map(), books: [] };
    g.names.set(b.series.trim(), (g.names.get(b.series.trim()) ?? 0) + 1);
    g.books.push(b);
    groups.set(k, g);
  }
  const list = [...groups.values()]
    .map((g) => ({
      // Show the most common spelling.
      name: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      total: g.books.filter((b) => !b.seriesPlaceholder).length,
      read: g.books.filter((b) => b.status === 'read' || readByMe.has(b.id)).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div class="page">
      <h1>Series</h1>
      {list.length === 0 ? (
        <Empty>No series yet. Set a book's Series and Number in series, or add books and they'll often be filled in.</Empty>
      ) : (
        <ul class="list series-index">
          {list.map((s) => (
            <li key={s.name}>
              <a href={seriesHref(s.name)}>
                <div class="list-main">
                  <strong>{s.name}</strong>
                  <div class="tiny muted">
                    {s.total} in your library · {s.read} read
                  </div>
                </div>
                <span class="muted">›</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
