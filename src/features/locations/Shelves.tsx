import { useMemo } from 'preact/hooks';
import { Empty } from '../../app/ui';
import { useLive } from '../../data/hooks';
import { collectionOf } from '../../data/models';
import { liveBooks, loadLocations } from '../../data/store';
import { badgeCode } from './util';

/** Every room, bookcase and shelf with how many books are on each. */
export function Shelves() {
  const locs = useLive(loadLocations);
  const books = useLive(liveBooks);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of books ?? []) if (b.location) m.set(b.location.shelfId, (m.get(b.location.shelfId) ?? 0) + 1);
    return m;
  }, [books]);

  if (!locs || !books) return <div class="page" />;
  const unshelved = books.filter((b) => !b.location && collectionOf(b) === 'owned').length;

  return (
    <div class="page">
      <div class="page-head">
        <h1>Shelves</h1>
        <div class="actions">
          <a class="button" href="#/labels">
            Print labels
          </a>
          <a class="button primary" href="#/shelve">
            Shelving mode
          </a>
        </div>
      </div>
      {unshelved > 0 && (
        <p class="notice">
          <a href="#/?unshelved=1">
            {unshelved} owned book{unshelved === 1 ? ' has' : 's have'} no location
          </a>
        </p>
      )}
      {locs.rooms.length === 0 && (
        <Empty>
          <p>No rooms yet.</p>
          <a class="button primary" href="#/settings/locations">
            Set up locations
          </a>
        </Empty>
      )}
      {locs.rooms.map((room) =>
        room.ebook ? (
          <section key={room.id} class="room">
            <h2>Ebooks</h2>
            <div class="bookcase ebook-places">
              {locs.bookcases
                .filter((bc) => bc.roomId === room.id)
                .map((bc) => {
                  const shelf = locs.shelves.find((s) => s.bookcaseId === bc.id);
                  return shelf ? (
                    <a class="shelf-row" key={bc.id} href={`#/shelf/${shelf.id}`}>
                      <span class="badge badge-ebook">{badgeCode(room, bc, shelf)}</span>
                      <span class="shelf-count">{counts.get(shelf.id) ?? 0}</span>
                    </a>
                  ) : null;
                })}
              {!locs.bookcases.some((bc) => bc.roomId === room.id) && <p class="muted tiny">No places added yet.</p>}
            </div>
          </section>
        ) : (
        <section key={room.id} class="room">
          <h2>
            {room.name} <span class="muted">{room.code}</span>
          </h2>
          <div class="bookcases">
            {locs.bookcases
              .filter((bc) => bc.roomId === room.id)
              .map((bc) => (
                <div class="bookcase" key={bc.id}>
                  <h3>
                    Bookcase {bc.number}
                    {bc.name && <span class="muted"> · {bc.name}</span>}
                  </h3>
                  {locs.shelves
                    .filter((s) => s.bookcaseId === bc.id)
                    .map((s) => (
                      <a class="shelf-row" key={s.id} href={`#/shelf/${s.id}`}>
                        <span class="badge">{badgeCode(room, bc, s)}</span>
                        <span class="shelf-count">{counts.get(s.id) ?? 0}</span>
                      </a>
                    ))}
                </div>
              ))}
          </div>
        </section>
        ),
      )}
      <p>
        <a href="#/settings/locations">Edit rooms, bookcases and shelves</a>
      </p>
    </div>
  );
}
