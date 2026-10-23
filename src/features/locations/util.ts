import type { Bookcase, Room, Row, Shelf } from '../../data/models';
import type { Locations } from '../../data/store';

export interface ResolvedShelf {
  shelf: Shelf;
  bookcase: Bookcase;
  room: Room;
  /** e.g. LR·2·3 */
  code: string;
}

export function badgeCode(room: Pick<Room, 'code'>, bookcase: Pick<Bookcase, 'number'>, shelf: Pick<Shelf, 'number'>) {
  return `${room.code}·${bookcase.number}·${shelf.number}`;
}

/** Index of every live shelf with its bookcase, room and badge code, sorted by code. */
export function resolveShelves(locs: Locations): Map<string, ResolvedShelf> {
  const rooms = new Map(locs.rooms.map((r) => [r.id, r]));
  const bookcases = new Map(locs.bookcases.map((b) => [b.id, b]));
  const out: ResolvedShelf[] = [];
  for (const shelf of locs.shelves) {
    const bookcase = bookcases.get(shelf.bookcaseId);
    const room = bookcase && rooms.get(bookcase.roomId);
    if (!bookcase || !room) continue;
    out.push({ shelf, bookcase, room, code: badgeCode(room, bookcase, shelf) });
  }
  out.sort(compareResolved);
  return new Map(out.map((r) => [r.shelf.id, r]));
}

export function compareResolved(a: ResolvedShelf, b: ResolvedShelf): number {
  return (
    a.room.name.localeCompare(b.room.name) ||
    a.bookcase.number - b.bookcase.number ||
    a.shelf.number - b.shelf.number
  );
}

/** Sort key so books order by room, bookcase, shelf, then front before back. */
export function locationSortKey(resolved: ResolvedShelf | undefined, row: Row | undefined): string {
  if (!resolved) return '￿';
  const pad = (n: number) => String(n).padStart(3, '0');
  return `${resolved.room.name.toLowerCase()}|${pad(resolved.bookcase.number)}|${pad(resolved.shelf.number)}|${row === 'back' ? 1 : 0}`;
}

/** The URL a shelf label's QR code points to. Shelving mode recognizes it when scanned. */
export function shelfUrl(shelfId: string): string {
  const base = location.href.split('#')[0];
  return `${base}#/shelf/${shelfId}`;
}

export function shelfIdFromScan(text: string): string | null {
  const m = text.match(/#\/shelf\/([A-Za-z0-9_]+)/);
  return m ? m[1] : null;
}
