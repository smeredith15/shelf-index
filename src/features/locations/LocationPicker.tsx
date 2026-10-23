import { useEffect, useState } from 'preact/hooks';
import { useLive } from '../../data/hooks';
import type { Row } from '../../data/models';
import { loadLocations } from '../../data/store';

export interface PickedLocation {
  shelfId: string;
  row: Row;
}

/** Room → bookcase → shelf → row. Calls onChange(null) when cleared. */
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
  if (locs.rooms.length === 0) {
    return (
      <p class="muted">
        No locations yet. <a href="#/settings/locations">Add rooms and bookcases</a> first.
      </p>
    );
  }

  const bookcases = locs.bookcases.filter((b) => b.roomId === roomId);
  const shelves = locs.shelves.filter((s) => s.bookcaseId === bookcaseId);
  const shelf = value && locs.shelves.find((s) => s.id === value.shelfId);

  return (
    <div class="loc-picker">
      <select
        value={roomId}
        onChange={(e) => {
          setRoomId(e.currentTarget.value);
          setBookcaseId('');
          onChange(null);
        }}
      >
        <option value="">Room…</option>
        {locs.rooms.map((r) => (
          <option value={r.id} key={r.id}>
            {r.name} ({r.code})
          </option>
        ))}
      </select>
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
    </div>
  );
}
