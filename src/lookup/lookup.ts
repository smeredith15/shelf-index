import type { Category } from '../data/models';
import { guessCategory } from './category';
import { toIsbn13 } from './isbn';

/** Book metadata from an outside source, before it becomes a library record. */
export interface BookCandidate {
  isbn13: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  pubYear: number | null;
  pageCount: number | null;
  subjects: string[];
  category: Category;
  series: string | null;
  seriesIndex: number | null;
  /** Open Library work key, used to find covers from other editions. */
  workKey: string | null;
  coverUrls: string[];
  source: 'openlibrary' | 'google';
}

const OL = 'https://openlibrary.org';

function year(text: string | undefined | null): number | null {
  const m = text?.match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

// ---------- Open Library ----------

interface OLEdition {
  title?: string;
  subtitle?: string;
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  isbn_13?: string[];
  isbn_10?: string[];
  covers?: number[];
  works?: { key: string }[];
  authors?: { key: string }[];
  series?: string[];
  subjects?: string[];
}

interface OLWork {
  title?: string;
  subjects?: string[];
  authors?: { author: { key: string } }[];
  covers?: number[];
}

function olCover(id: number, size: 'M' | 'L' = 'L'): string {
  return `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;
}

function parseSeries(raw: string | undefined): { series: string | null; seriesIndex: number | null } {
  if (!raw) return { series: null, seriesIndex: null };
  const m = raw.match(/^(.*?)[\s,;#(]*(?:no\.|book|vol\.?|#)?\s*(\d+(?:\.\d+)?)\)?\s*$/i);
  if (m && m[1]) return { series: m[1].trim(), seriesIndex: Number(m[2]) };
  return { series: raw.trim(), seriesIndex: null };
}

async function openLibraryByIsbn(isbn13: string): Promise<BookCandidate | null> {
  const ed = await getJson<OLEdition>(`${OL}/isbn/${isbn13}.json`);
  if (!ed?.title) return null;
  const workKey = ed.works?.[0]?.key ?? null;
  const work = workKey ? await getJson<OLWork>(`${OL}${workKey}.json`) : null;
  const authorKeys = ed.authors?.map((a) => a.key) ?? work?.authors?.map((a) => a.author.key) ?? [];
  const authors = (
    await Promise.all(authorKeys.slice(0, 4).map((k) => getJson<{ name?: string }>(`${OL}${k}.json`)))
  )
    .map((a) => a?.name)
    .filter((n): n is string => !!n);
  const subjects = unique([...(ed.subjects ?? []), ...(work?.subjects ?? [])]).slice(0, 15);
  const covers = unique([...(ed.covers ?? []), ...(work?.covers ?? [])]).filter((id) => id > 0);
  return {
    isbn13,
    title: ed.title,
    subtitle: ed.subtitle ?? null,
    authors,
    publisher: ed.publishers?.[0] ?? null,
    pubYear: year(ed.publish_date),
    pageCount: ed.number_of_pages ?? null,
    subjects,
    category: guessCategory(subjects),
    ...parseSeries(ed.series?.[0]),
    workKey,
    coverUrls: covers.map((id) => olCover(id)),
    source: 'openlibrary',
  };
}

interface OLSearchDoc {
  key: string;
  title: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  subject?: string[];
  publisher?: string[];
  series?: string[];
}

async function openLibrarySearch(query: string): Promise<BookCandidate[]> {
  const fields = 'key,title,subtitle,author_name,first_publish_year,isbn,cover_i,number_of_pages_median,subject,publisher';
  const data = await getJson<{ docs: OLSearchDoc[] }>(
    `${OL}/search.json?q=${encodeURIComponent(query)}&fields=${fields}&limit=20`,
  );
  return (data?.docs ?? []).map((d) => {
    const isbn13 = d.isbn?.map((i) => toIsbn13(i)).find((i): i is string => !!i) ?? null;
    const subjects = (d.subject ?? []).slice(0, 15);
    return {
      isbn13,
      title: d.title,
      subtitle: d.subtitle ?? null,
      authors: d.author_name ?? [],
      publisher: d.publisher?.[0] ?? null,
      pubYear: d.first_publish_year ?? null,
      pageCount: d.number_of_pages_median ?? null,
      subjects,
      category: guessCategory(subjects),
      series: null,
      seriesIndex: null,
      workKey: d.key,
      coverUrls: d.cover_i ? [olCover(d.cover_i)] : [],
      source: 'openlibrary' as const,
    };
  });
}

/** Covers from every edition of the work, so you can pick the one that matches your copy. */
export async function editionCovers(workKey: string): Promise<string[]> {
  const data = await getJson<{ entries: OLEdition[] }>(`${OL}${workKey}/editions.json?limit=100`);
  const ids = unique((data?.entries ?? []).flatMap((e) => e.covers ?? [])).filter((id) => id > 0);
  return ids.slice(0, 40).map((id) => olCover(id, 'M'));
}

// ---------- Google Books ----------

interface GVolume {
  volumeInfo: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    categories?: string[];
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { thumbnail?: string; small?: string; medium?: string; large?: string };
  };
}

function googleCandidate(v: GVolume): BookCandidate | null {
  const info = v.volumeInfo;
  if (!info.title) return null;
  const isbn13 =
    info.industryIdentifiers
      ?.map((i) => toIsbn13(i.identifier))
      .find((i): i is string => !!i) ?? null;
  const subjects = info.categories ?? [];
  const img = info.imageLinks;
  const cover = (img?.large ?? img?.medium ?? img?.small ?? img?.thumbnail)
    ?.replace('http://', 'https://')
    .replace('&edge=curl', '');
  return {
    isbn13,
    title: info.title,
    subtitle: info.subtitle ?? null,
    authors: info.authors ?? [],
    publisher: info.publisher ?? null,
    pubYear: year(info.publishedDate),
    pageCount: info.pageCount ?? null,
    subjects,
    category: guessCategory(subjects),
    series: null,
    seriesIndex: null,
    workKey: null,
    coverUrls: cover ? [cover] : [],
    source: 'google',
  };
}

async function googleSearch(q: string): Promise<BookCandidate[]> {
  const data = await getJson<{ items?: GVolume[] }>(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&printType=books`,
  );
  return (data?.items ?? []).map(googleCandidate).filter((c): c is BookCandidate => !!c);
}

// ---------- Public API ----------

/** Looks up an ISBN in both sources and fills gaps in the Open Library record with Google's. */
export async function lookupIsbn(input: string): Promise<BookCandidate | null> {
  const isbn13 = toIsbn13(input);
  if (!isbn13) return null;
  const [ol, google] = await Promise.all([openLibraryByIsbn(isbn13), googleSearch(`isbn:${isbn13}`)]);
  const g = google[0] ?? null;
  if (!ol && !g) return null;
  if (!ol) return { ...g!, isbn13 };
  if (!g) return ol;
  const subjects = ol.subjects.length ? ol.subjects : g.subjects;
  return {
    ...ol,
    subtitle: ol.subtitle ?? g.subtitle,
    authors: ol.authors.length ? ol.authors : g.authors,
    publisher: ol.publisher ?? g.publisher,
    pubYear: ol.pubYear ?? g.pubYear,
    pageCount: ol.pageCount ?? g.pageCount,
    subjects,
    category: guessCategory([...subjects, ...g.subjects]),
    coverUrls: unique([...ol.coverUrls, ...g.coverUrls]),
  };
}

/** Free-text search by title, author or ISBN across both sources. */
export async function searchBooks(query: string): Promise<BookCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const isbn = toIsbn13(q);
  if (isbn) {
    const hit = await lookupIsbn(isbn);
    return hit ? [hit] : [];
  }
  const [ol, google] = await Promise.all([openLibrarySearch(q), googleSearch(q)]);
  // Interleave so both sources show up near the top.
  const out: BookCandidate[] = [];
  for (let i = 0; i < Math.max(ol.length, google.length); i++) {
    if (ol[i]) out.push(ol[i]);
    if (google[i]) out.push(google[i]);
  }
  return out;
}

export const __test = { parseSeries, year };

/** Finds the Open Library work for a book already in the library, to offer other editions' covers. */
export async function findWorkKey(book: { isbn13: string | null; title: string; authors: string[] }): Promise<string | null> {
  const q = book.isbn13 ? `isbn=${book.isbn13}` : `title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(book.authors[0] ?? '')}`;
  const data = await getJson<{ docs: { key: string }[] }>(`${OL}/search.json?${q}&fields=key&limit=1`);
  return data?.docs[0]?.key ?? null;
}
