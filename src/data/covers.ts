import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import { db } from './db';
import type { Book } from './models';
import { markDirty } from './store';
import { coverPath } from '../sync/files';
import { fetchCover } from '../sync/sync';

const COVER_WIDTH = 400;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

/** Scales to ~400px wide and re-encodes as JPEG so covers stay small in the data repo. */
export async function compressCover(blob: Blob): Promise<Blob> {
  const img = await loadImage(blob);
  const scale = Math.min(1, COVER_WIDTH / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), 'image/jpeg', 0.82),
  );
}

async function storeCover(book: Book, blob: Blob): Promise<Book> {
  const compressed = await compressCover(blob);
  await db.covers.put({ bookId: book.id, blob: compressed, rev: String(Date.now()), synced: false });
  await markDirty();
  return { ...book, cover: coverPath(book.id) };
}

/**
 * Copies an outside cover image into the library. If the host blocks cross-origin reads,
 * falls back to linking the URL. Returns the updated (unsaved) book.
 */
export async function setCoverFromUrl(book: Book, url: string): Promise<Book> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    // Open Library serves a 1x1 placeholder for missing covers.
    if (blob.size < 1000) throw new Error('Placeholder image');
    return { ...(await storeCover(book, blob)), coverUrl: url };
  } catch {
    await db.covers.delete(book.id);
    return { ...book, cover: null, coverUrl: url };
  }
}

export async function setCoverFromFile(book: Book, file: Blob): Promise<Book> {
  return { ...(await storeCover(book, file)), coverUrl: null };
}

const inflight = new Map<string, Promise<Blob | null>>();

/** Resolves the best image for a book: local copy, then the data repo, then the outside URL. */
export function useCoverSrc(book: Pick<Book, 'id' | 'cover' | 'coverUrl'> | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!book) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    const show = (blob: Blob | null) => {
      if (cancelled) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = blob ? URL.createObjectURL(blob) : null;
      setSrc(objectUrl ?? book.coverUrl);
    };
    // Live, so a newly photographed or synced cover replaces the old one straight away.
    const sub = liveQuery(() => db.covers.get(book.id)).subscribe({
      next: async (row) => {
        if (row) return show(row.blob);
        if (!book.cover) return show(null);
        let p = inflight.get(book.id);
        if (!p) {
          p = fetchCover(book.id, book.cover).catch(() => null);
          inflight.set(book.id, p);
          void p.finally(() => inflight.delete(book.id));
        }
        // On success fetchCover stores the blob, which re-fires this subscription.
        if (!(await p)) show(null);
      },
      error: () => show(null),
    });
    return () => {
      cancelled = true;
      sub.unsubscribe();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [book?.id, book?.cover, book?.coverUrl]);
  return src;
}
