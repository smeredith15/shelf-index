import { useState } from 'preact/hooks';
import { Modal } from '../../app/ui';
import { moveBooks } from '../../data/store';
import { LocationPicker, type PickedLocation } from './LocationPicker';

export function MoveDialog({ bookIds, onClose, onMoved }: { bookIds: string[]; onClose: () => void; onMoved: () => void }) {
  const [target, setTarget] = useState<PickedLocation | null>(null);
  const n = bookIds.length;
  return (
    <Modal title={`Move ${n} book${n === 1 ? '' : 's'}`} onClose={onClose}>
      <LocationPicker value={target} onChange={setTarget} />
      <div class="form-actions">
        <button
          onClick={async () => {
            await moveBooks(bookIds, null);
            onMoved();
          }}
        >
          Remove location
        </button>
        <button
          class="primary"
          disabled={!target}
          onClick={async () => {
            if (!target) return;
            await moveBooks(bookIds, target.shelfId, target.row);
            onMoved();
          }}
        >
          Move
        </button>
      </div>
    </Modal>
  );
}
