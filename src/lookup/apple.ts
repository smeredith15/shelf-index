import type { BookCandidate } from './lookup';
import { guessCategory } from './category';

/**
 * Apple Books, via the public iTunes Search API. It usually carries new releases (as ebooks) on
 * day one, often before Google's API indexes them. The API doesn't send CORS headers, so it's
 * called the documented way for web pages: JSONP, a <script> whose callback receives the JSON.
 */

type Loader = <T>(url: string) => Promise<T | null>;

let counter = 0;

function jsonp<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const name = `__shelfApple${counter++}`;
    const w = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    const done = (value: T | null) => {
      clearTimeout(timer);
      delete w[name];
      script.remove();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    w[name] = (data: T) => done(data);
    script.onerror = () => done(null);
    script.src = `${url}&callback=${name}`;
    document.head.appendChild(script);
  });
}

let load: Loader = jsonp;

/** Tests swap in a fake loader, since JSONP needs a real browser. */
export function setAppleLoader(loader: Loader | null): void {
  load = loader ?? jsonp;
}

interface AppleResult {
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  genres?: string[];
}

function candidate(r: AppleResult, isbn13: string | null): BookCandidate | null {
  if (!r.trackName) return null;
  // Apple titles often carry the subtitle: "The Shark House: A Novel".
  const [title, ...rest] = r.trackName.split(/:\s+/);
  const subjects = (r.genres ?? []).filter((g) => g !== 'Books');
  const cover = r.artworkUrl100?.replace(/\/\d+x\d+bb\./, '/600x600bb.');
  const yearMatch = r.releaseDate?.match(/\d{4}/);
  return {
    isbn13,
    title,
    subtitle: rest.join(': ') || null,
    authors: r.artistName ? r.artistName.split(/\s*(?:,|&)\s*|\s+and\s+/).filter(Boolean) : [],
    publisher: null,
    pubYear: yearMatch ? Number(yearMatch[0]) : null,
    pageCount: null,
    subjects,
    category: guessCategory(subjects),
    series: null,
    seriesIndex: null,
    workKey: null,
    coverUrls: cover ? [cover] : [],
    source: 'apple',
  };
}

const API = 'https://itunes.apple.com';

/** Null when Apple couldn't be reached; an empty list when it answered with nothing. */
export async function appleSearch(term: string): Promise<BookCandidate[] | null> {
  const data = await load<{ results?: AppleResult[] }>(
    `${API}/search?term=${encodeURIComponent(term)}&media=ebook&entity=ebook&limit=15`,
  );
  if (!data) return null;
  return (data.results ?? []).map((r) => candidate(r, null)).filter((c): c is BookCandidate => !!c);
}

export async function appleByIsbn(isbn13: string): Promise<BookCandidate | null> {
  const data = await load<{ results?: AppleResult[] }>(`${API}/lookup?isbn=${isbn13}&entity=ebook`);
  const first = data?.results?.[0];
  return first ? candidate(first, isbn13) : null;
}
