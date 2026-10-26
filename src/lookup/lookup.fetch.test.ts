import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupIsbn, lookupNearbyEditions, searchBooks, setGoogleBooksKey, withProblems } from './lookup';

const responses: Record<string, unknown> = {
  'https://openlibrary.org/isbn/9780441172719.json': {
    title: 'Dune',
    publishers: ['Ace'],
    publish_date: 'August 1990',
    number_of_pages: 535,
    covers: [8231856],
    works: [{ key: '/works/OL893415W' }],
    authors: [{ key: '/authors/OL79034A' }],
  },
  'https://openlibrary.org/works/OL893415W.json': {
    title: 'Dune',
    subjects: ['Science fiction', 'Desert planets'],
    covers: [11481354],
  },
  'https://openlibrary.org/authors/OL79034A.json': { name: 'Frank Herbert' },
  'https://www.googleapis.com/books/v1/volumes?q=isbn%3A9780441172719&maxResults=20&printType=books': {
    items: [
      {
        volumeInfo: {
          title: 'Dune',
          subtitle: 'Deluxe Edition',
          authors: ['Frank Herbert'],
          categories: ['Fiction'],
          imageLinks: { thumbnail: 'http://books.google.com/books/content?id=x&zoom=1&edge=curl' },
        },
      },
    ],
  },
};

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  vi.stubGlobal('fetch', async (url: string) => {
    const body = responses[url];
    return body ? new Response(JSON.stringify(body)) : new Response('{}', { status: 404 });
  });
}

describe('lookupIsbn', () => {
  it('combines Open Library with Google Books', async () => {
    stubFetch();
    const hit = await lookupIsbn('0441172717');
    expect(hit).toMatchObject({
      isbn13: '9780441172719',
      title: 'Dune',
      subtitle: 'Deluxe Edition',
      authors: ['Frank Herbert'],
      publisher: 'Ace',
      pubYear: 1990,
      pageCount: 535,
      category: 'fiction',
      workKey: '/works/OL893415W',
    });
    expect(hit!.coverUrls).toEqual([
      'https://covers.openlibrary.org/b/id/8231856-L.jpg',
      'https://covers.openlibrary.org/b/id/11481354-L.jpg',
      'https://books.google.com/books/content?id=x&zoom=1',
    ]);
  });

  it('returns null for unknown or invalid ISBNs', async () => {
    stubFetch();
    expect(await lookupIsbn('9780306406157')).toBeNull();
    expect(await lookupIsbn('not an isbn')).toBeNull();
  });

  it('searches by ISBN when the query is one', async () => {
    stubFetch();
    expect((await searchBooks('978-0-441-17271-9')).map((c) => c.title)).toEqual(['Dune']);
  });
});

describe('lookup problems and fallbacks', () => {
  afterEach(() => setGoogleBooksKey(''));

  it('reports when Google is over its daily limit instead of claiming nothing exists', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('googleapis') ? new Response('{"error":{"code":429}}', { status: 429 }) : new Response('{}', { status: 404 }),
    );
    const { value, problems } = await withProblems(() => searchBooks('Some New Book'));
    expect(value).toEqual([]);
    expect(problems).toEqual(['google-limit']);
  });

  it('sends the Google Books key when one is set', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url);
      return new Response('{}', { status: 404 });
    });
    setGoogleBooksKey('KEY123');
    await searchBooks('anything');
    expect(seen.find((u) => u.includes('googleapis'))).toContain('&key=KEY123');
  });

  it('falls back to the Open Library search index for ISBNs the edition lookup misses', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.startsWith('https://openlibrary.org/search.json?isbn=9781400347971')) {
        return new Response(JSON.stringify({ docs: [{ key: '/works/OL1W', title: 'A 2026 Novel', author_name: ['New Author'], isbn: ['9781400347988'] }] }));
      }
      return new Response('{}', { status: 404 });
    });
    const hit = await lookupIsbn('9781400347971');
    expect(hit?.title).toBe('A 2026 Novel');
    // The ISBN asked about is kept, not the other edition's.
    expect(hit?.isbn13).toBe('9781400347971');
  });
});

describe('lookupNearbyEditions', () => {
  it('finds a book listed under a neighbouring ISBN', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const q = new URL(url).searchParams.get('q');
      if (q === 'isbn:9781400347988') {
        return new Response(JSON.stringify({ items: [{ volumeInfo: { title: 'The Shark House', authors: ['A. Writer'],
          industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781400347988' }] } }] }));
      }
      return new Response('{}');
    });
    const near = await lookupNearbyEditions('9781400347971');
    expect(near.map((c) => [c.title, c.isbn13])).toEqual([['The Shark House', '9781400347988']]);
  });
});
