import { describe, expect, it } from 'vitest';
import { blankBook } from '../../data/models';
import { findByTitle, nextInSeries, seriesKey, titleKey } from './series';

const book = (id: string, index: number | null, patch = {}) =>
  blankBook({ id, title: id, series: 'Discworld', seriesIndex: index, ...patch });

describe('nextInSeries', () => {
  it('picks the next book in the library when it has no plans yet', () => {
    const books = [book('d1', 1), book('d2', 2), book('d3', 3)];
    expect(nextInSeries(books, books[0], new Set())).toEqual({ kind: 'existing', book: books[1] });
  });

  it('leaves the next book alone if it is already planned, read or being read', () => {
    for (const status of ['to-read', 'reading', 'read'] as const) {
      const books = [book('d1', 1), book('d2', 2, { status })];
      expect(nextInSeries(books, books[0], new Set())).toBeNull();
    }
  });

  it('asks for a placeholder when the next number is not in the library', () => {
    const books = [book('d1', 1), book('d3', 3)];
    expect(nextInSeries(books, books[0], new Set())).toEqual({ kind: 'missing', series: 'Discworld', index: 2 });
  });

  it('does not duplicate a placeholder', () => {
    const books = [book('d1', 1), book('p2', 2, { seriesPlaceholder: true, status: 'to-read' })];
    expect(nextInSeries(books, books[0], new Set())).toBeNull();
  });

  it('only acts on the furthest read book, and needs a series number', () => {
    const books = [book('d1', 1), book('d2', 2), book('d4', 4)];
    expect(nextInSeries(books, books[0], new Set(['d4']))).toBeNull();
    expect(nextInSeries(books, book('x', null), new Set())).toBeNull();
    expect(nextInSeries(books, blankBook({ id: 'y', series: null, seriesIndex: 1 }), new Set())).toBeNull();
  });

  it('matches series names loosely and handles novellas', () => {
    const books = [book('d1', 1), book('d15', 1.5, { series: ' discworld ' }), book('d2', 2)];
    expect(nextInSeries(books, books[0], new Set())).toEqual({ kind: 'existing', book: books[1] });
  });
});

describe('series and title matching', () => {
  it('treats variant series names as the same series', () => {
    expect(seriesKey('Millennium series')).toBe('millennium');
    expect(seriesKey('The Millennium Trilogy')).toBe('millennium');
    expect(seriesKey('Millennium')).toBe('millennium');
    expect(seriesKey('A Song of Ice and Fire')).toBe('a song of ice and fire');
    // The reported case: #2 filed as "Millennium series", #3 as "Millennium".
    const books = [
      blankBook({ id: 'm2', title: 'The Girl Who Played with Fire', series: 'Millennium series', seriesIndex: 2 }),
      blankBook({ id: 'm3', title: "The Girl Who Kicked the Hornet's Nest", series: 'Millennium', seriesIndex: 3, status: 'to-read' }),
    ];
    expect(nextInSeries(books, books[0], new Set())).toBeNull();
  });

  it('matches titles despite apostrophes, subtitles and articles', () => {
    expect(titleKey("The Girl Who Kicked the Hornet's Nest")).toBe(titleKey('Girl Who Kicked the Hornets Nest: A Novel'));
    const books = [blankBook({ id: 'h', title: "The Girl Who Kicked the Hornets' Nest", authors: ['Stieg Larsson'] })];
    expect(findByTitle(books, "The Girl Who Kicked the Hornet's Nest", ['Stieg Larsson'])?.id).toBe('h');
    expect(findByTitle(books, "The Girl Who Kicked the Hornet's Nest", ['Someone Else'])).toBeUndefined();
  });
});
