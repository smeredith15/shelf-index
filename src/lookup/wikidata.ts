import { titleKey } from '../features/reading/series';

/**
 * Series data from Wikidata (free, no key, CORS-enabled): which series a book belongs to and its
 * number, and every book in a series in order. Coverage is good for well-known series and patchy
 * elsewhere, so every caller falls back to what the library itself knows.
 */

const ENDPOINT = 'https://query.wikidata.org/sparql';

export interface SeriesMatch {
  seriesId: string;
  seriesName: string;
  ordinal: number | null;
}

export interface SeriesEntry {
  id: string;
  title: string;
  ordinal: number | null;
  year: number | null;
  authors: string[];
}

interface Binding {
  [key: string]: { value: string } | undefined;
}

async function query(sparql: string): Promise<Binding[] | null> {
  try {
    const res = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(sparql)}`, {
      headers: { Accept: 'application/sparql-results+json' },
    });
    if (!res.ok) return null;
    return ((await res.json()) as { results?: { bindings?: Binding[] } }).results?.bindings ?? [];
  } catch {
    return null;
  }
}

const literal = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const qid = (url: string | undefined) => url?.split('/').pop() ?? '';
const surname = (name: string) => name.trim().split(/\s+/).pop()?.toLowerCase() ?? '';

/** "2", "2.5" or "Book 2" → a number; anything else → null. */
export function parseOrdinal(value: string | undefined): number | null {
  const m = value?.match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const matchCache = new Map<string, Promise<SeriesMatch | null>>();

/** The series a book belongs to, matched by title (and author surname when known). */
export function findSeriesForBook(title: string, authors: string[]): Promise<SeriesMatch | null> {
  const key = `${titleKey(title)}|${authors.map(surname).join(',')}`;
  let cached = matchCache.get(key);
  if (!cached) {
    cached = lookupSeries(title, authors);
    matchCache.set(key, cached);
    // Don't remember failures, so a later try can succeed.
    void cached.then((m) => m === null && matchCache.delete(key));
  }
  return cached;
}

async function lookupSeries(title: string, authors: string[]): Promise<SeriesMatch | null> {
  const search = title.split(/:\s/)[0];
  const rows = await query(`
SELECT ?book ?bookLabel ?series ?seriesLabel ?ord (GROUP_CONCAT(DISTINCT ?authorLabel; separator="|") AS ?authors) WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch";
      mwapi:search ${literal(search)}; mwapi:language "en".
    ?book wikibase:apiOutputItem mwapi:item.
  }
  ?book p:P179 ?st. ?st ps:P179 ?series.
  OPTIONAL { ?st pq:P1545 ?ord. }
  OPTIONAL { ?book wdt:P50 ?author. ?author rdfs:label ?authorLabel. FILTER(LANG(?authorLabel) = "en") }
  ?book rdfs:label ?bookLabel. FILTER(LANG(?bookLabel) = "en")
  ?series rdfs:label ?seriesLabel. FILTER(LANG(?seriesLabel) = "en")
}
GROUP BY ?book ?bookLabel ?series ?seriesLabel ?ord
LIMIT 25`);
  if (!rows) return null;
  const want = titleKey(title);
  const names = new Set(authors.map(surname).filter(Boolean));
  const hit = rows.find((r) => {
    if (titleKey(r.bookLabel?.value ?? '') !== want) return false;
    const rowAuthors = (r.authors?.value ?? '').split('|').filter(Boolean);
    return names.size === 0 || rowAuthors.length === 0 || rowAuthors.some((a) => names.has(surname(a)));
  });
  if (!hit) return null;
  return { seriesId: qid(hit.series?.value), seriesName: hit.seriesLabel!.value, ordinal: parseOrdinal(hit.ord?.value) };
}

const entriesCache = new Map<string, Promise<SeriesEntry[] | null>>();

/** Every book in a series, in order (by number, then publication year). Null if unreachable. */
export function seriesEntries(seriesId: string): Promise<SeriesEntry[] | null> {
  let cached = entriesCache.get(seriesId);
  if (!cached) {
    cached = loadEntries(seriesId);
    entriesCache.set(seriesId, cached);
    void cached.then((e) => e === null && entriesCache.delete(seriesId));
  }
  return cached;
}

async function loadEntries(seriesId: string): Promise<SeriesEntry[] | null> {
  if (!/^Q\d+$/.test(seriesId)) return null;
  const rows = await query(`
SELECT ?book ?bookLabel ?ord (MIN(YEAR(?date)) AS ?year) (GROUP_CONCAT(DISTINCT ?authorLabel; separator="|") AS ?authors) WHERE {
  ?book p:P179 ?st. ?st ps:P179 wd:${seriesId}.
  FILTER EXISTS { ?book wdt:P31/wdt:P279* wd:Q7725634. }
  OPTIONAL { ?st pq:P1545 ?ord. }
  OPTIONAL { ?book wdt:P577 ?date. }
  OPTIONAL { ?book wdt:P50 ?author. ?author rdfs:label ?authorLabel. FILTER(LANG(?authorLabel) = "en") }
  ?book rdfs:label ?bookLabel. FILTER(LANG(?bookLabel) = "en")
}
GROUP BY ?book ?bookLabel ?ord`);
  if (!rows) return null;
  const byId = new Map<string, SeriesEntry>();
  for (const r of rows) {
    const id = qid(r.book?.value);
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      title: r.bookLabel?.value ?? '',
      ordinal: parseOrdinal(r.ord?.value),
      year: r.year?.value ? Number(r.year.value) : null,
      authors: (r.authors?.value ?? '').split('|').filter(Boolean),
    });
  }
  return [...byId.values()].sort(
    (a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || (a.year ?? Infinity) - (b.year ?? Infinity) || a.title.localeCompare(b.title),
  );
}

/** Test hook: forget cached answers. */
export function clearWikidataCache(): void {
  matchCache.clear();
  entriesCache.clear();
}

/** Fills in a book's series and number from Wikidata when they're missing, giving up after `ms`. */
export async function withSeriesFromWikidata<T extends { title: string; authors: string[]; series: string | null; seriesIndex: number | null }>(
  book: T,
  ms = 4000,
): Promise<T> {
  if (book.series || !book.title.trim()) return book;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  const match = await Promise.race([findSeriesForBook(book.title, book.authors), timeout]);
  return match ? { ...book, series: match.seriesName, seriesIndex: book.seriesIndex ?? match.ordinal } : book;
}
