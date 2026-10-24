import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import type { Book } from '../data/models';
import { useCoverSrc } from '../data/covers';
import type { ResolvedShelf } from '../features/locations/util';

export function Badge({ resolved, row }: { resolved: ResolvedShelf | undefined; row?: 'front' | 'back' }) {
  if (!resolved) return null;
  return (
    <span class={`badge${row === 'back' ? ' badge-back' : ''}`} title={`${resolved.room.name}, bookcase ${resolved.bookcase.number}, shelf ${resolved.shelf.number}${row === 'back' ? ', back row' : ''}`}>
      {resolved.code}
      {row === 'back' && <small> back</small>}
    </span>
  );
}

export function Cover({ book, resolved, size = 'md' }: { book: Book; resolved?: ResolvedShelf; size?: 'sm' | 'md' | 'lg' }) {
  const src = useCoverSrc(book);
  return (
    <div class={`cover cover-${size}`}>
      {src ? (
        <img src={src} alt="" loading="lazy" />
      ) : (
        <div class="cover-placeholder">
          <strong>{book.title}</strong>
          <span>{book.authors[0] ?? ''}</span>
        </div>
      )}
      {resolved && book.location && (
        <div class="cover-badge">
          <Badge resolved={resolved} row={book.location.row} />
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal" role="dialog" aria-label={title}>
        <header class="modal-head">
          <h2>{title}</h2>
          <button class="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ComponentChildren; hint?: string }) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      {children}
      {hint && <span class="field-hint">{hint}</span>}
    </label>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <div class="empty">{children}</div>;
}

/** A bar pinned under the header, so Save/Add stay reachable on long forms. */
export function ActionBar({ children }: { children: ComponentChildren }) {
  return <div class="action-bar">{children}</div>;
}
