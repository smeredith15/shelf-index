import { useEffect, useState } from 'preact/hooks';
import { Modal } from '../../app/ui';
import { editionCovers, findWorkKey } from '../../lookup/lookup';

/** Pick a cover from known URLs and other editions, or photograph your own copy. */
export function CoverPicker({
  initialUrls,
  workKey,
  book,
  onPickUrl,
  onPickFile,
  onClose,
}: {
  initialUrls: string[];
  workKey: string | null;
  book: { isbn13: string | null; title: string; authors: string[] };
  onPickUrl: (url: string) => void;
  onPickFile: (file: File) => void;
  onClose: () => void;
}) {
  const [urls, setUrls] = useState(initialUrls);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = workKey ?? (await findWorkKey(book));
      const more = key ? await editionCovers(key) : [];
      if (!cancelled) {
        setUrls((prev) => [...new Set([...prev, ...more])]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workKey]);

  return (
    <Modal title="Choose a cover" onClose={onClose}>
      <label class="button primary file-button">
        📷 Photograph my copy
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) onPickFile(file);
          }}
        />
      </label>
      <div class="cover-choices">
        {urls.map((url) => (
          <button key={url} class="cover-choice" onClick={() => onPickUrl(url)}>
            <img src={url} alt="" loading="lazy" onError={(e) => (e.currentTarget.parentElement!.style.display = 'none')} />
          </button>
        ))}
      </div>
      {loading && <p class="muted">Looking for other editions…</p>}
      {!loading && urls.length === 0 && <p class="muted">No covers found. Take a photo instead.</p>}
    </Modal>
  );
}
