import { describe, expect, it } from 'vitest';
import { blankBook } from '../../data/models';
import { nextInSeries } from './series';

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
