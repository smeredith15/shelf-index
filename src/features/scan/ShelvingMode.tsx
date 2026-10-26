import { useMemo, useRef, useState } from 'preact/hooks';
import { Badge } from '../../app/ui';
import { useLive } from '../../data/hooks';
import { type Row, withCollection } from '../../data/models';
import { findBookByIsbn, loadLocations, saveBook } from '../../data/store';
import { toIsbn13 } from '../../lookup/isbn';
import { lookupIsbn } from '../../lookup/lookup';
import { LocationPicker } from '../locations/LocationPicker';
import { resolveShelves, shelfIdFromScan } from '../locations/util';
import { addFromCandidate } from './AddBook';
import { Scanner } from './Scanner';

interface LogEntry {
  key: number;
  text: string;
  bookId?: string;
  href?: string;
  kind: 'ok' | 'new' | 'warn' | 'shelf';
}

/**
 * Scan a shelf label to make it the active shelf, then scan books to put them there.
 * Unknown books are looked up and added on the spot.
 */
export function ShelvingMode({ initialShelf }: { initialShelf: string | null }) {
  const locs = useLive(loadLocations);
  const resolved = useMemo(() => (locs ? resolveShelves(locs) : new Map()), [locs]);
  const [shelfId, setShelfId] = useState<string | null>(initialShelf);
  const [row, setRow] = useState<Row>('front');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);
  // Latest values for the scanner callback, which is created once.
  const current = useRef({ shelfId, row, resolved });
  current.current = { shelfId, row, resolved };

  const push = (entry: Omit<LogEntry, 'key'>) => setLog((l) => [{ ...entry, key: counter.current++ }, ...l].slice(0, 50));

  const handle = async (raw: string) => {
    const { shelfId: active, row: activeRow, resolved: shelves } = current.current;
    const scannedShelf = shelfIdFromScan(raw);
    if (scannedShelf) {
      const r = shelves.get(scannedShelf);
      if (!r) return push({ kind: 'warn', text: 'That label is for a shelf that no longer exists.' });
      setShelfId(scannedShelf);
      setRow('front');
      return push({ kind: 'shelf', text: `Now shelving on ${r.code}` });
    }
    const isbn = toIsbn13(raw);
    if (!isbn) return;
    if (!active) return push({ kind: 'warn', text: 'Scan a shelf label first.' });
    const target = shelves.get(active);
    const rowToUse: Row = target?.shelf.hasBackRow ? activeRow : 'front';
    const where = `${target?.code ?? ''}${rowToUse === 'back' ? ' (back)' : ''}`;

    setBusy(true);
    try {
      const existing = await findBookByIsbn(isbn);
      if (existing) {
        if (existing.location?.shelfId === active && existing.location.row === rowToUse) {
          push({ kind: 'ok', text: `${existing.title} is already on ${where}`, bookId: existing.id });
        } else {
          await saveBook({ ...withCollection(existing, 'owned'), location: { shelfId: active, row: rowToUse } });
          push({ kind: 'ok', text: `${existing.title} → ${where}`, bookId: existing.id });
        }
        return;
      }
      push({ kind: 'new', text: `Looking up ${isbn}…` });
      const hit = await lookupIsbn(isbn);
      if (!hit) {
        push({ kind: 'warn', text: `No match for ${isbn}. Tap to check other editions or search by title.`, href: `#/add?isbn=${isbn}` });
        return;
      }
      const book = await addFromCandidate(hit, { owned: true, collection: 'owned', location: { shelfId: active, row: rowToUse } });
      push({ kind: 'new', text: `Added ${book.title} → ${where}`, bookId: book.id });
    } finally {
      setBusy(false);
    }
  };

  const active = shelfId ? resolved.get(shelfId) : undefined;

  return (
    <div class="page">
      <div class="page-head">
        <h1>Shelving</h1>
        <a class="button" href={active ? `#/shelf/${active.shelf.id}` : '#/shelves'}>
          Done
        </a>
      </div>

      <div class="shelving-status">
        {active ? (
          <>
            <Badge resolved={active} row={row} />
            <span class="muted">
              {active.room.name}, bookcase {active.bookcase.number}, shelf {active.shelf.number}
            </span>
            {active.shelf.hasBackRow && (
              <div class="segmented">
                {(['front', 'back'] as Row[]).map((r) => (
                  <button key={r} class={row === r ? 'active' : ''} onClick={() => setRow(r)}>
                    {r === 'front' ? 'Front row' : 'Back row'}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <span>Scan a shelf label to start, or pick a shelf:</span>
        )}
      </div>
      {!active && <LocationPicker value={null} onChange={(l) => l && (setShelfId(l.shelfId), setRow(l.row))} />}

      <Scanner paused={busy} onDetect={(d) => void handle(d.rawValue)} />

      <ul class="shelving-log">
        {log.map((e) => (
          <li key={e.key} class={`log-${e.kind}`}>
            {e.bookId ? <a href={`#/book/${e.bookId}`}>{e.text}</a> : e.href ? <a href={e.href}>{e.text}</a> : e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
