import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../../app/router';
import { ActionBar, Cover, Empty } from '../../app/ui';
import { db } from '../../data/db';
import { useLive } from '../../data/hooks';
import { type Book, type Collection, blankBook, withCollection } from '../../data/models';
import { findBookByIsbn, loadLocations, saveBook } from '../../data/store';
import { setCoverFromUrl } from '../../data/covers';
import { toIsbn13 } from '../../lookup/isbn';
import {
  type BookCandidate,
  type LookupProblem,
  type SourceName,
  type SourceTally,
  lookupIsbn,
  lookupNearbyEditions,
  searchBooks,
  withProblems,
} from '../../lookup/lookup';
import { BookForm } from '../library/BookForm';
import { resolveShelves } from '../locations/util';
import { Scanner } from './Scanner';

type Mode = 'scan' | 'search';

export function candidateToBook(c: BookCandidate, extra: Partial<Book> = {}): Book {
  return blankBook({
    isbn13: c.isbn13,
    title: c.title,
    subtitle: c.subtitle,
    authors: c.authors,
    publisher: c.publisher,
    pubYear: c.pubYear,
    pageCount: c.pageCount,
    subjects: c.subjects,
    category: c.category,
    series: c.series,
    seriesIndex: c.seriesIndex,
    ...extra,
  });
}

/** Creates a book from lookup data, copying its first working cover into the library. */
export async function addFromCandidate(c: BookCandidate, extra: Partial<Book> = {}): Promise<Book> {
  let book = candidateToBook(c, extra);
  for (const url of c.coverUrls.slice(0, 2)) {
    book = await setCoverFromUrl(book, url);
    if (book.cover) break;
  }
  return saveBook(book);
}

const SOURCE_LABELS: Record<SourceName, string> = { openlibrary: 'Open Library', google: 'Google Books', apple: 'Apple Books' };

/** "Open Library 0 · Google Books 0 · Apple Books didn't respond", so a miss shows where it missed. */
function describeSources(sources: SourceTally): string {
  return (Object.keys(SOURCE_LABELS) as SourceName[])
    .filter((k) => k in sources)
    .map((k) => `${SOURCE_LABELS[k]} ${sources[k] === null ? "didn't respond" : sources[k]}`)
    .join(' · ');
}

/** Plain-language reasons a lookup came back empty, beyond "not found". */
export function describeProblems(problems: LookupProblem[]): string | null {
  if (problems.includes('google-key')) return 'Google Books rejected the API key in Settings → Book lookups.';
  if (problems.includes('google-limit'))
    return "Google Books is over its free daily limit, so only Open Library was searched. Adding your own Google Books API key in Settings → Book lookups avoids this.";
  if (problems.includes('unreachable')) return "Couldn't reach a book service. Check your connection and try again.";
  return null;
}

export function AddBook({
  initialMode,
  collection = 'owned',
  initialIsbn = null,
}: {
  initialMode?: Mode;
  collection?: Collection;
  /** An ISBN that lookup missed (e.g. from shelving mode); kept for whatever book gets added. */
  initialIsbn?: string | null;
}) {
  const [mode, setMode] = useState<Mode>(initialIsbn ? 'search' : (initialMode ?? 'scan'));
  // The ISBN printed on the copy in hand, when lookup missed it. The book is saved with this one,
  // even if the match found by title lists a different edition's ISBN.
  const [pendingIsbn, setPendingIsbn] = useState<string | null>(initialIsbn);
  const [problem, setProblem] = useState<string | null>(null);
  const [searched, setSearched] = useState<string | null>(null);
  /** Set when the results shown are books found under ISBNs neighbouring a missed one. */
  const [nearbyFor, setNearbyFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ book: Book; candidate: BookCandidate | null } | null>(null);
  const [existing, setExisting] = useState<Book | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const locs = useLive(loadLocations);
  const resolved = locs ? resolveShelves(locs) : new Map();

  const startDraft = async (candidate: BookCandidate | null, fallback: Partial<Book> = {}, isbn = pendingIsbn) => {
    let book = withCollection(candidate ? candidateToBook(candidate) : blankBook(fallback), collection);
    if (isbn) book = { ...book, isbn13: isbn };
    // Pre-fill the first cover so the form shows something; it can be changed before saving.
    if (candidate?.coverUrls[0]) book = await setCoverFromUrl(book, candidate.coverUrls[0]);
    setDraft({ book, candidate });
  };

  const handleIsbn = async (raw: string) => {
    const isbn = toIsbn13(raw);
    if (!isbn) {
      setStatus(`“${raw}” isn't a book ISBN.`);
      return;
    }
    const found = await findBookByIsbn(isbn);
    if (found) {
      setExisting(found);
      return;
    }
    setBusy(true);
    setStatus(`Looking up ${isbn}…`);
    const { value: hit, problems } = await withProblems(() => lookupIsbn(isbn));
    setBusy(false);
    setStatus(null);
    if (hit) {
      // Searching another edition's ISBN (e.g. the one Google lists) still saves the printed one.
      await startDraft(hit, {}, pendingIsbn ?? isbn);
      return;
    }
    // Not found: search by title instead, keeping the printed ISBN for the book that gets added.
    // A later miss doesn't replace it: the first ISBN is the one on the copy in hand.
    setPendingIsbn((current) => current ?? isbn);
    setMode('search');
    // New releases are often listed under another edition's ISBN, which is usually a neighbour.
    setBusy(true);
    setStatus('Not found under that ISBN. Checking other editions…');
    const near = await withProblems(() => lookupNearbyEditions(isbn));
    setBusy(false);
    setStatus(null);
    setProblem(describeProblems([...problems, ...near.problems]));
    setResults(near.value.length ? near.value : null);
    setNearbyFor(near.value.length ? isbn : null);
  };

  // Arriving with a missed ISBN (from shelving mode): run the same checks straight away.
  useEffect(() => {
    if (initialIsbn) void handleIsbn(initialIsbn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async (e: Event) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setResults(null);
    const isbn = toIsbn13(query);
    if (isbn) {
      setBusy(false);
      return handleIsbn(isbn);
    }
    const { value, problems, sources } = await withProblems(() => searchBooks(query));
    setNearbyFor(null);
    setResults(value);
    setSearched(describeSources(sources));
    setProblem(describeProblems(problems));
    setBusy(false);
  };

  const pick = async (c: BookCandidate) => {
    if (c.isbn13) {
      const found = await findBookByIsbn(c.isbn13);
      if (found) return setExisting(found);
      setBusy(true);
      const full = await lookupIsbn(c.isbn13);
      setBusy(false);
      if (full) return startDraft({ ...full, coverUrls: [...new Set([...full.coverUrls, ...c.coverUrls])], workKey: full.workKey ?? c.workKey });
    }
    await startDraft(c);
  };

  if (draft) {
    return (
      <div class="page">
        <ActionBar>
          <button
            type="button"
            onClick={async () => {
              await db.covers.delete(draft.book.id);
              setDraft(null);
              setStatus(null);
            }}
          >
            Cancel
          </button>
          <button type="submit" form="add-book-form" class="primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add to library'}
          </button>
        </ActionBar>
        <h1>{collection === 'wishlist' ? 'Add to wishlist' : 'Add book'}</h1>
        {status && <p class="notice">{status}</p>}
        <BookForm
          initial={draft.book}
          coverUrls={draft.candidate?.coverUrls}
          workKey={draft.candidate?.workKey}
          resolved={resolved}
          formId="add-book-form"
          onSubmit={async (book) => {
            setBusy(true);
            try {
              const saved = await saveBook(book);
              navigate(`/book/${saved.id}`);
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div class="page">
      <h1>{collection === 'wishlist' ? 'Add to wishlist' : 'Add book'}</h1>
      <div class="segmented wide">
        <button class={mode === 'scan' ? 'active' : ''} onClick={() => setMode('scan')}>
          Scan barcode
        </button>
        <button class={mode === 'search' ? 'active' : ''} onClick={() => setMode('search')}>
          Search
        </button>
      </div>

      {status && <p class="notice">{status}</p>}
      {pendingIsbn && !busy && (
        <p class="notice">
          {nearbyFor ? (
            <>
              <strong>{pendingIsbn}</strong> isn't listed, but other editions with nearby ISBNs are. <strong>Tap yours</strong>, or
              search by title if it isn't here.
            </>
          ) : (
            <>
              No match for <strong>{pendingIsbn}</strong> or nearby editions. Search by title or author instead.
            </>
          )}{' '}
          <button
            class="link"
            onClick={() => {
              setPendingIsbn(null);
              setNearbyFor(null);
            }}
          >
            Forget it
          </button>
        </p>
      )}
      {problem && <p class="notice notice-warn">{problem}</p>}

      {existing && (
        <div class="notice">
          <strong>{existing.title}</strong> is already in your library.{' '}
          <a href={`#/book/${existing.id}`}>Open it</a> ·{' '}
          <button class="link" onClick={() => setExisting(null)}>
            Keep scanning
          </button>
        </div>
      )}

      {mode === 'scan' && (
        <>
          <Scanner
            paused={busy || !!existing}
            onDetect={(d) => {
              if (d.format === 'ean_13' || /^\d{10,13}$/.test(d.rawValue)) void handleIsbn(d.rawValue);
            }}
          />
          <p class="muted center">Point the camera at the barcode on the back cover.</p>
        </>
      )}

      {mode === 'search' && (
        <>
          <form class="search-row" onSubmit={runSearch}>
            <input
              type="search"
              placeholder="ISBN, title or author"
              value={query}
              autoFocus
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            <button class="primary" disabled={busy}>
              Search
            </button>
          </form>
          {busy && <p class="muted">Searching…</p>}
          {results && results.length === 0 && (
            <Empty>
              No matches. Try fewer words, or add it by hand.
              {searched && <div class="tiny">Searched {searched}.</div>}
            </Empty>
          )}
          {results && results.length > 0 && (
            <ul class="results">
              {results.map((c, i) => (
                <li key={i}>
                  <button class="result" onClick={() => pick(c)}>
                    <Cover book={{ ...blankBook({ id: `tmp${i}`, title: c.title, authors: c.authors }), coverUrl: c.coverUrls[0] ?? null }} size="sm" />
                    <div>
                      <strong>{c.title}</strong>
                      {c.subtitle && <span class="muted">: {c.subtitle}</span>}
                      <div class="muted">
                        {c.authors.join(', ')}
                        {c.pubYear ? ` · ${c.pubYear}` : ''}
                        {c.pageCount ? ` · ${c.pageCount} pp` : ''}
                      </div>
                      <div class="tiny muted">{SOURCE_LABELS[c.source]}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p class="center">
        <button class="link" onClick={() => startDraft(null)}>
          Add a book by hand
        </button>
      </p>
    </div>
  );
}
