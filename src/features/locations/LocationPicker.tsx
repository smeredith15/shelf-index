import { useEffect, useState } from 'preact/hooks';
import { useLive } from '../../data/hooks';
import type { Row } from '../../data/models';
import { addEbookPlace, ensureEbookRoom, loadLocations } from '../../data/store';

export interface PickedLocation {
  shelfId: string;
  row: Row;
  /** Set when the pick is an ebook place, so the form can mark the format. Not stored on the book. */
  ebook?: boolean;
}

const EBOOKS = '__ebooks__';
const ADD_PLACE = '__add__';

/**
 * Room → bookcase → shelf → row. Calls onChange(null) when cleared.
 * Ebooks is offered as a room too; its second dropdown is where the ebook is saved, with no shelf or row.
 */
export function LocationPicker({
  value,
  onChange,
}: {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation | null) => void;
}) {
  const locs = useLive(loadLocations);
  const [roomId, setRoomId] = useState('');
  const [bookcaseId, setBookcaseId] = useState('');

  // Sync the dropdowns to the current value once locations load.
  useEffect(() => {
    if (!locs || !value) return;
    const shelf = locs.shelves.find((s) => s.id === value.shelfId);
    const bc = shelf && locs.bookcases.find((b) => b.id === shelf.bookcaseId);
    if (bc) {
      setBookcaseId(bc.id);
      setRoomId(bc.roomId);
    }
  }, [locs, value?.shelfId]);

  if (!locs) return null;
  const room = locs.rooms.find((r) => r.id === roomId);
  const isEbook = !!room?.ebook;
  const physicalRooms = locs.rooms.filter((r) => !r.ebook);
  const ebookRoom = locs.rooms.find((r) => r.ebook);
  const bookcases = locs.bookcases.filter((b) => b.roomId === roomId);
  const shelves = locs.shelves.filter((s) => s.bookcaseId === bookcaseId);
  const shelf = value && locs.shelves.find((s) => s.id === value.shelfId);

  return (
    <div class="loc-picker">
      <select
        value={roomId}
        onChange={async (e) => {
          const picked = e.currentTarget.value;
          setBookcaseId('');
          onChange(null);
          setRoomId(picked === EBOOKS ? (await ensureEbookRoom()).id : picked);
        }}
      >
        <option value="">Room…</option>
        {physicalRooms.map((r) => (
          <option value={r.id} key={r.id}>
            {r.name} ({r.code})
          </option>
        ))}
        <option value={ebookRoom?.id ?? EBOOKS}>Ebooks</option>
      </select>
      {isEbook && room ? (
        <select
          value={bookcaseId}
          onChange={async (e) => {
            const picked = e.currentTarget.value;
            if (picked === ADD_PLACE) {
              const name = prompt('Where are these ebooks saved? For example Kindle, Libby or Apple Books.')?.trim();
              if (!name) return;
              const { bookcase, shelf } = await addEbookPlace(room.id, name);
              setBookcaseId(bookcase.id);
              onChange({ shelfId: shelf.id, row: 'front', ebook: true });
              return;
            }
            setBookcaseId(picked);
            const only = locs.shelves.find((s) => s.bookcaseId === picked);
            onChange(only ? { shelfId: only.id, row: 'front', ebook: true } : null);
          }}
        >
          <option value="">Saved in…</option>
          {bookcases.map((b) => (
            <option value={b.id} key={b.id}>
              {b.name || `Place ${b.number}`}
            </option>
          ))}
          <option value={ADD_PLACE}>＋ Add a place…</option>
        </select>
      ) : (
        <>
          <select
            value={bookcaseId}
            disabled={!roomId}
            onChange={(e) => {
              setBookcaseId(e.currentTarget.value);
              onChange(null);
            }}
          >
            <option value="">Bookcase…</option>
            {bookcases.map((b) => (
              <option value={b.id} key={b.id}>
                {b.number}
                {b.name ? ` · ${b.name}` : ''}
              </option>
            ))}
          </select>
          <select
            value={value?.shelfId ?? ''}
            disabled={!bookcaseId}
            onChange={(e) => {
              const id = e.currentTarget.value;
              const s = locs.shelves.find((x) => x.id === id);
              onChange(id ? { shelfId: id, row: s?.hasBackRow ? (value?.row ?? 'front') : 'front' } : null);
            }}
          >
            <option value="">Shelf…</option>
            {shelves.map((s) => (
              <option value={s.id} key={s.id}>
                Shelf {s.number}
              </option>
            ))}
          </select>
          {shelf?.hasBackRow && value && (
            <div class="segmented">
              {(['front', 'back'] as Row[]).map((row) => (
                <button
                  type="button"
                  key={row}
                  class={value.row === row ? 'active' : ''}
                  onClick={() => onChange({ ...value, row })}
                >
                  {row === 'front' ? 'Front' : 'Back'}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {physicalRooms.length === 0 && (
        <p class="muted tiny">
          No rooms yet. <a href="#/settings/locations">Add rooms and bookcases</a> for your physical shelves.
        </p>
      )}
    </div>
  );
}
