import { db } from './db';
import { type Book, type Session, blankBook, newId, now } from './models';
import { liveBooks, loadSettings, markDirty, saveBook, saveBooks } from './store';
import { queueFor, renumber } from '../features/queue/logic';
import { today } from '../features/reading/dates';
import { findByTitle, nextInSeries } from '../features/reading/series';
import { findSeriesForBook, seriesEntries } from '../lookup/wikidata';

/** The real title of book `index` in `finished`'s series, from Wikidata, within a few seconds. */
async function wikidataTitleAt(finished: Book, index: number): Promise<{ title: string; authors: string[] } | null> {
  const lookup = (async () => {
    const match = await findSeriesForBook(finished.title, finished.authors);
    if (!match) return null;
    const entries = await seriesEntries(match.seriesId);
    const entry = entries?.find((e) => e.ordinal === index);
    return entry ? { title: entry.title, authors: entry.authors } : null;
  })();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
  return Promise.race([lookup, timeout]);
}

// ---------- Sessions ----------

export async function liveSessions(): Promise<Session[]> {
  return (await db.sessions.toArray()).filter((s) => !s.deleted);
}

async function putSession(session: Session): Promise<void> {
  await db.sessions.put({ ...session, updatedAt: now() });
  await markDirty();
}

/** Starts a read (or reread): opens a session, marks the book Reading and takes it out of the queue. */
export async function startReading(book: Book, date = today()): Promise<void> {
  await putSession({
    id: newId('r'),
    bookId: book.id,
    start: date,
    end: null,
    outcome: 'reading',
    pauses: [],
    progress: [],
    updatedAt: now(),
    deleted: false,
  });
  await leaveQueue(book, { status: 'reading' });
}

export async function pauseReading(session: Session, date = today()): Promise<void> {
  if (session.pauses.some((p) => p.to === null)) return;
  await putSession({ ...session, pauses: [...session.pauses, { from: date, to: null }] });
}

export async function resumeReading(session: Session, date = today()): Promise<void> {
  await putSession({ ...session, pauses: session.pauses.map((p) => (p.to === null ? { ...p, to: date } : p)) });
}

/**
 * After finishing a book in a series, puts the next one on To Read: the library's copy if it has
 * no plans yet, or a placeholder to find later. Returns a note for the reader, or null.
 */
export async function promoteNextInSeries(finished: Book): Promise<string | null> {
  const [books, sessions] = await Promise.all([liveBooks(), liveSessions()]);
  const readIds = new Set(sessions.filter((s) => s.outcome === 'finished').map((s) => s.bookId));
  const next = nextInSeries(books, finished, readIds);
  if (!next) return null;
  if (next.kind === 'existing') {
    await saveBook({ ...next.book, status: 'to-read' });
    return `Next in the series, ${next.book.title}, is now on To Read.`;
  }
  // Not matched by series name. The library may still have it under no (or another) series name,
  // so find its real title and look for that.
  const real = await wikidataTitleAt(finished, next.index);
  if (real) {
    const have = findByTitle(books, real.title, real.authors.length ? real.authors : finished.authors);
    if (have) {
      const wasUnplanned = have.status === 'none';
      await saveBook({
        ...have,
        series: have.series || next.series,
        seriesIndex: have.seriesIndex ?? next.index,
        status: wasUnplanned ? 'to-read' : have.status,
      });
      return wasUnplanned ? `Next in the series, ${have.title}, is now on To Read.` : null;
    }
  }
  await saveBook(
    blankBook({
      title: real?.title ?? `${next.series} #${next.index}`,
      series: next.series,
      seriesIndex: next.index,
      authors: finished.authors,
      category: finished.category,
      status: 'to-read',
      owned: false,
      collection: 'wishlist',
      seriesPlaceholder: true,
    }),
  );
  const name = real ? real.title : `${next.series} #${next.index}`;
  return `Next in the series, ${name}, isn't in your library, so a placeholder is on To Read. Find it from Up Next.`;
}

/** Ends a session as finished or DNF and updates the book's status to match. */
export async function endReading(
  book: Book,
  session: Session,
  outcome: 'finished' | 'dnf',
  date = today(),
): Promise<string | null> {
  await putSession({
    ...session,
    end: date,
    outcome,
    pauses: session.pauses.map((p) => (p.to === null ? { ...p, to: date } : p)),
  });
  await leaveQueue(book, { status: outcome === 'finished' ? 'read' : 'dnf' });
  return outcome === 'finished' ? promoteNextInSeries(book) : null;
}

export async function logProgress(session: Session, page: number, date = today()): Promise<void> {
  const progress = session.progress.filter((p) => p.date !== date);
  progress.push({ date, page });
  progress.sort((a, b) => a.date.localeCompare(b.date));
  await putSession({ ...session, progress });
}

/** Records a past read with known dates, e.g. one finished before you started using the app. */
export async function addPastRead(
  book: Book,
  start: string,
  end: string,
  outcome: 'finished' | 'dnf',
): Promise<string | null> {
  await putSession({
    id: newId('r'),
    bookId: book.id,
    start,
    end,
    outcome,
    pauses: [],
    progress: [],
    updatedAt: now(),
    deleted: false,
  });
  // Only change the status if this book isn't currently being read.
  const open = (await db.sessions.where('bookId').equals(book.id).toArray()).some((s) => !s.deleted && s.end === null);
  if (!open) await leaveQueue(book, { status: outcome === 'finished' ? 'read' : 'dnf' });
  return outcome === 'finished' ? promoteNextInSeries(book) : null;
}

export async function updateSession(session: Session): Promise<void> {
  await putSession(session);
}

export async function deleteSession(session: Session): Promise<void> {
  await putSession({ ...session, deleted: true });
}

// ---------- Up Next queue ----------

/** Adds a book to the end of its category's queue, moving it to the Up Next shelf if that's switched on. */
export async function joinQueue(book: Book): Promise<void> {
  const [books, settings] = await Promise.all([liveBooks(), loadSettings()]);
  const position = queueFor(books, book.category).length + 1;
  const shelf = settings.upNextAutoMove && settings.upNextShelfId;
  const shelfExists = shelf && (await db.shelves.get(shelf))?.deleted === false;
  // Queueing a book means you mean to read it, and it's no longer just on the radar.
  await saveBook({
    ...book,
    status: book.status === 'none' ? 'to-read' : book.status,
    radarAt: null,
    queue: { inQueue: true, position },
    location: shelfExists ? { shelfId: shelf, row: 'front' } : book.location,
  });
}

/** Removes a book from the queue and closes the gap. */
export async function leaveQueue(book: Book, patch: Partial<Book> = {}): Promise<void> {
  const updated = { ...book, ...patch, queue: { inQueue: false, position: null } };
  if (!book.queue.inQueue) {
    if (Object.keys(patch).length) await saveBook(updated);
    return;
  }
  const rest = queueFor(await liveBooks(), book.category).filter((b) => b.id !== book.id);
  await saveBooks([updated, ...renumber(rest)]);
}

/** Saves edits to a book; if a queued book changed category it moves to the end of the other queue. */
export async function saveBookKeepingQueue(before: Book, after: Book): Promise<void> {
  if (!before.queue.inQueue || before.category === after.category) {
    await saveBook(after);
    return;
  }
  const books = await liveBooks();
  const oldRest = queueFor(books, before.category).filter((b) => b.id !== before.id);
  const position = queueFor(books, after.category).length + 1;
  await saveBooks([{ ...after, queue: { inQueue: true, position } }, ...renumber(oldRest)]);
}

/** Pins a book "on the radar" at the top of the To Read list (making it To Read), or unpins it. */
export async function setRadar(book: Book, on: boolean): Promise<void> {
  await saveBook({
    ...book,
    radarAt: on ? now() : null,
    status: on && book.status === 'none' ? 'to-read' : book.status,
  });
}

export async function reorderQueue(ordered: Book[]): Promise<void> {
  const changed = renumber(ordered);
  if (changed.length) await saveBooks(changed);
}
