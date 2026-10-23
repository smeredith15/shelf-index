import { useState } from 'preact/hooks';
import { useLive } from '../../data/hooks';
import type { Bookcase, Room, Shelf } from '../../data/models';
import {
  addBookcase,
  addRoom,
  addShelf,
  deleteLocation,
  liveBooks,
  loadLocations,
  updateBookcase,
  updateRoom,
  updateShelf,
} from '../../data/store';

export function LocationsEditor() {
  const locs = useLive(loadLocations);
  const books = useLive(liveBooks);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  if (!locs || !books) return null;

  const booksOn = (shelfIds: string[]) => books.filter((b) => b.location && shelfIds.includes(b.location.shelfId)).length;
  const confirmDelete = (what: string, shelfIds: string[]) => {
    const n = booksOn(shelfIds);
    return confirm(n ? `Remove ${what}? ${n} book${n === 1 ? '' : 's'} on it will lose their location.` : `Remove ${what}?`);
  };

  return (
    <div class="locations-editor">
      <p class="muted">
        Bookcases are numbered left to right from the room's entrance; shelves top to bottom. Badge codes look like{' '}
        <span class="badge">LR·2·3</span>.
      </p>

      {locs.rooms.map((room) => {
        const roomCases = locs.bookcases.filter((b) => b.roomId === room.id);
        const roomShelfIds = locs.shelves.filter((s) => roomCases.some((c) => c.id === s.bookcaseId)).map((s) => s.id);
        return (
          <section class="room-edit" key={room.id}>
            <div class="room-edit-head">
              <RoomFields room={room} />
              <button
                class="ghost danger-text"
                onClick={() => confirmDelete(`${room.name} and all its bookcases`, roomShelfIds) && deleteLocation('room', room.id)}
              >
                Remove
              </button>
            </div>
            {roomCases.map((bc) => (
              <BookcaseEdit
                key={bc.id}
                bookcase={bc}
                room={room}
                shelves={locs.shelves.filter((s) => s.bookcaseId === bc.id)}
                onDelete={(shelfIds) =>
                  confirmDelete(`bookcase ${bc.number}`, shelfIds) && deleteLocation('bookcase', bc.id)
                }
                onDeleteShelf={(id, n) => confirmDelete(`shelf ${n}`, [id]) && deleteLocation('shelf', id)}
              />
            ))}
            <AddBookcase roomId={room.id} />
          </section>
        );
      })}

      <form
        class="add-room"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || !code.trim()) return;
          await addRoom(name.trim(), code.trim());
          setName('');
          setCode('');
        }}
      >
        <h3>Add a room</h3>
        <div class="row-inline">
          <input placeholder="Name, e.g. Living Room" value={name} onInput={(e) => setName(e.currentTarget.value)} />
          <input
            placeholder="Code"
            class="code-input"
            maxLength={4}
            value={code}
            onInput={(e) => setCode(e.currentTarget.value.toUpperCase())}
          />
          <button class="primary" disabled={!name.trim() || !code.trim()}>
            Add room
          </button>
        </div>
      </form>
    </div>
  );
}

function RoomFields({ room }: { room: Room }) {
  return (
    <div class="row-inline">
      <input value={room.name} onChange={(e) => updateRoom({ ...room, name: e.currentTarget.value })} aria-label="Room name" />
      <input
        class="code-input"
        maxLength={4}
        value={room.code}
        onChange={(e) => updateRoom({ ...room, code: e.currentTarget.value })}
        aria-label="Room code"
      />
    </div>
  );
}

function BookcaseEdit({
  bookcase,
  room,
  shelves,
  onDelete,
  onDeleteShelf,
}: {
  bookcase: Bookcase;
  room: Room;
  shelves: Shelf[];
  onDelete: (shelfIds: string[]) => void;
  onDeleteShelf: (id: string, number: number) => void;
}) {
  return (
    <div class="bookcase-edit">
      <div class="row-inline">
        <strong>
          {room.code}·{bookcase.number}
        </strong>
        <input
          placeholder="Nickname (optional)"
          value={bookcase.name}
          onChange={(e) => updateBookcase({ ...bookcase, name: e.currentTarget.value })}
        />
        <button class="ghost danger-text" onClick={() => onDelete(shelves.map((s) => s.id))}>
          Remove
        </button>
      </div>
      <ul class="shelf-edit-list">
        {shelves.map((s) => (
          <li key={s.id}>
            <span>Shelf {s.number}</span>
            <label class="check">
              <input type="checkbox" checked={s.hasBackRow} onChange={(e) => updateShelf({ ...s, hasBackRow: e.currentTarget.checked })} />
              Back row
            </label>
            <button class="ghost danger-text small" onClick={() => onDeleteShelf(s.id, s.number)} aria-label={`Remove shelf ${s.number}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button class="link" onClick={() => addShelf(bookcase.id, shelves.some((s) => s.hasBackRow))}>
        + Add shelf
      </button>
    </div>
  );
}

function AddBookcase({ roomId }: { roomId: string }) {
  const [count, setCount] = useState(5);
  const [back, setBack] = useState(false);
  return (
    <div class="row-inline add-bookcase">
      <span>New bookcase with</span>
      <input
        type="number"
        min={1}
        max={20}
        class="num-input"
        value={count}
        onInput={(e) => setCount(Math.max(1, Math.min(20, Number(e.currentTarget.value) || 1)))}
      />
      <span>shelves</span>
      <label class="check">
        <input type="checkbox" checked={back} onChange={(e) => setBack(e.currentTarget.checked)} />
        back rows
      </label>
      <button onClick={() => addBookcase(roomId, count, back)}>Add bookcase</button>
    </div>
  );
}
