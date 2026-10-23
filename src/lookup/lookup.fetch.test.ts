import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupIsbn, searchBooks } from './lookup';

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
