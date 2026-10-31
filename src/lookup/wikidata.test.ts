import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db';
import { blankBook } from '../data/models';
import { promoteNextInSeries } from '../data/reading';
import { saveBook } from '../data/store';
import { clearWikidataCache, findSeriesForBook, parseOrdinal, seriesEntries } from './wikidata';

const b = (v: string) => ({ value: v });
const MILLENNIUM = 'http://www.wikidata.org/entity/Q1046434';

/** A fake Wikidata: the title search finds book 2; the series lists books 1-3 (out of order). */
function stubWikidata(available = true) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (!available) return new Response('', { status: 503 });
    const q = decodeURIComponent(url);
    if (q.includes('EntitySearch')) {
      return Response.json({
        results: {
          bindings: [
            { book: b('http://www.wikidata.org/entity/Q2'), bookLabel: b('The Girl Who Played with Fire'), series: b(MILLENNIUM), seriesLabel: b('Millennium'), ord: b('2'), authors: b('Stieg Larsson') },
          ],
        },
      });
    }
    return Response.json({
      results: {
        bindings: [
          { book: b('http://www.wikidata.org/entity/Q3'), bookLabel: b("The Girl Who Kicked the Hornets' Nest"), ord: b('3'), year: b('2007'), authors: b('Stieg Larsson') },
          { book: b('http://www.wikidata.org/entity/Q1'), bookLabel: b('The Girl with the Dragon Tattoo'), ord: b('1'), year: b('2005'), authors: b('Stieg Larsson') },
          { book: b('http://www.wikidata.org/entity/Q2'), bookLabel: b('The Girl Who Played with Fire'), ord: b('2'), year: b('2006'), authors: b('Stieg Larsson') },
        ],
      },
    });
  });
}

beforeEach(async () => {
  clearWikidataCache();
  await Promise.all(db.tables.map((t) => t.clear()));
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('wikidata', () => {
  it('finds a book’s series and lists the series in order', async () => {
    stubWikidata();
    const match = await findSeriesForBook('The Girl Who Played with Fire', ['Stieg Larsson']);
    expect(match).toEqual({ seriesId: 'Q1046434', seriesName: 'Millennium', ordinal: 2 });
    expect((await seriesEntries('Q1046434'))!.map((e) => [e.ordinal, e.title])).toEqual([
      [1, 'The Girl with the Dragon Tattoo'],
      [2, 'The Girl Who Played with Fire'],
      [3, "The Girl Who Kicked the Hornets' Nest"],
    ]);
    expect(await findSeriesForBook('The Girl Who Played with Fire', ['Someone Else'])).toBeNull();
    expect(parseOrdinal('Book 4')).toBe(4);
  });
});

describe('next in series with the library', () => {
  it('marks the sequel already in the library To Read instead of adding a placeholder', async () => {
    stubWikidata();
    // The reported case: #3 was added first, with no series details; #2 says "Millennium series".
    const m3 = await saveBook(blankBook({ title: "The Girl Who Kicked the Hornet's Nest", authors: ['Stieg Larsson'] }));
    const m2 = await saveBook(blankBook({ title: 'The Girl Who Played with Fire', authors: ['Stieg Larsson'], series: 'Millennium series', seriesIndex: 2, status: 'read' }));
    const note = await promoteNextInSeries(m2);
    expect(note).toContain("The Girl Who Kicked the Hornet's Nest");
    const after = await db.books.get(m3.id);
    expect(after).toMatchObject({ status: 'to-read', series: 'Millennium series', seriesIndex: 3 });
    expect((await db.books.toArray()).filter((x) => x.seriesPlaceholder)).toEqual([]);
  });

  it('names the placeholder after the real book when the sequel is not in the library', async () => {
    stubWikidata();
    const m2 = await saveBook(blankBook({ title: 'The Girl Who Played with Fire', authors: ['Stieg Larsson'], series: 'Millennium', seriesIndex: 2, status: 'read' }));
    await promoteNextInSeries(m2);
    const placeholder = (await db.books.toArray()).find((x) => x.seriesPlaceholder);
    expect(placeholder).toMatchObject({ title: "The Girl Who Kicked the Hornets' Nest", seriesIndex: 3, status: 'to-read' });

    // Adding the real book (under any variant of the series name) retires the placeholder.
    await saveBook(blankBook({ title: "The Girl Who Kicked the Hornet's Nest", authors: ['Stieg Larsson'], series: 'The Millennium Trilogy', seriesIndex: 3 }));
    expect((await db.books.get(placeholder!.id))?.deleted).toBe(true);
  });

  it('falls back to a generic placeholder when Wikidata is unavailable', async () => {
    stubWikidata(false);
    const m2 = await saveBook(blankBook({ title: 'The Girl Who Played with Fire', authors: ['Stieg Larsson'], series: 'Millennium', seriesIndex: 2, status: 'read' }));
    await promoteNextInSeries(m2);
    expect((await db.books.toArray()).find((x) => x.seriesPlaceholder)?.title).toBe('Millennium #3');
  });
});
