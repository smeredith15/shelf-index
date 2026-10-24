import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'preact/hooks';
import { Empty } from '../../app/ui';
import { useLive } from '../../data/hooks';
import { loadLocations } from '../../data/store';
import { resolveShelves, shelfUrl } from './util';

function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

/** Printable shelf labels: big badge code plus a QR code that opens (or, in shelving mode, selects) the shelf. */
export function Labels() {
  const locs = useLive(loadLocations);
  // Ebook places have no physical shelf to label.
  const resolved = useMemo(() => (locs ? [...resolveShelves(locs).values()].filter((r) => !r.room.ebook) : []), [locs]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  if (!locs) return <div class="page" />;
  if (resolved.length === 0) {
    return (
      <div class="page">
        <Empty>
          No shelves yet. <a href="#/settings/locations">Set up locations</a> first.
        </Empty>
      </div>
    );
  }

  const bookcaseGroups = locs.bookcases
    .map((bc) => ({ bc, room: locs.rooms.find((r) => r.id === bc.roomId), shelves: resolved.filter((r) => r.bookcase.id === bc.id) }))
    .filter((g) => g.room && g.shelves.length);
  const toPrint = resolved.filter((r) => !excluded.has(r.bookcase.id));

  return (
    <div class="page">
      <div class="no-print">
        <p>
          <a href="#/shelves">‹ Shelves</a>
        </p>
        <div class="page-head">
          <h1>Shelf labels</h1>
          <button class="primary" onClick={() => window.print()}>
            Print {toPrint.length}
          </button>
        </div>
        <p class="muted">Choose which bookcases to print. Each label's QR code opens that shelf; in shelving mode it selects the shelf.</p>
        <div class="label-pick">
          {bookcaseGroups.map(({ bc, room, shelves }) => (
            <label class="check" key={bc.id}>
              <input
                type="checkbox"
                checked={!excluded.has(bc.id)}
                onChange={() =>
                  setExcluded((s) => {
                    const next = new Set(s);
                    if (next.has(bc.id)) next.delete(bc.id);
                    else next.add(bc.id);
                    return next;
                  })
                }
              />
              {room!.name} · bookcase {bc.number} ({shelves.length})
            </label>
          ))}
        </div>
      </div>
      <div class="labels">
        {toPrint.map((r) => (
          <div class="label" key={r.shelf.id}>
            <div class="label-qr" dangerouslySetInnerHTML={{ __html: qrSvg(shelfUrl(r.shelf.id)) }} />
            <div class="label-text">
              <div class="label-code">{r.code}</div>
              <div class="label-sub">
                {r.room.name} · case {r.bookcase.number} · shelf {r.shelf.number}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
