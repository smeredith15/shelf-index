import { Cover } from '../../app/ui';
import type { Book, Session } from '../../data/models';
import type { ResolvedShelf } from '../locations/util';
import { currentPage, isPaused, readingDays } from './logic';

/** Books being read, for the top of the home screen: progress, day count and paused state. */
export function NowReading({
  books,
  sessions,
  resolved,
}: {
  books: Book[];
  sessions: Session[];
  resolved: Map<string, ResolvedShelf>;
}) {
  const open = new Map(sessions.filter((s) => s.end === null).map((s) => [s.bookId, s]));
  // A book counts if it has an open read, or is marked Reading by hand without one.
  const reading = books
    .filter((b) => open.has(b.id) || b.status === 'reading')
    .sort((a, b) => (open.get(b.id)?.start ?? '').localeCompare(open.get(a.id)?.start ?? ''));
  if (reading.length === 0) return null;

  return (
    <section class="now-reading">
      <h2>Now reading</h2>
      <div class="now-reading-row">
        {reading.map((b) => {
          const s = open.get(b.id);
          const page = s ? currentPage(s) : null;
          const pct = page !== null && b.pageCount ? Math.min(100, Math.round((100 * page) / b.pageCount)) : null;
          return (
            <a key={b.id} href={`#/book/${b.id}`} class="now-reading-item">
              <Cover book={b} resolved={b.location ? resolved.get(b.location.shelfId) : undefined} size="sm" />
              <div class="now-reading-info">
                <strong>{b.title}</strong>
                <span class="muted tiny">{b.authors[0] ?? ''}</span>
                {pct !== null && (
                  <div class="progress-bar" aria-label={`${pct}% read`}>
                    <div style={{ width: `${pct}%` }} />
                  </div>
                )}
                <span class="tiny muted">
                  {s && isPaused(s) && <span class="paused-tag">Paused</span>}
                  {page !== null ? `p. ${page}${b.pageCount ? ` of ${b.pageCount}` : ''}` : s ? 'No progress logged' : ''}
                  {s && ` · day ${readingDays(s)}`}
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
