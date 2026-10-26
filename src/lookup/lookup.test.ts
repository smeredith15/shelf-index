import { describe, expect, it } from 'vitest';
import { guessCategory } from './category';
import { isbn10to13, neighborIsbns, toIsbn13 } from './isbn';
import { __test } from './lookup';

describe('isbn', () => {
  it('converts ISBN-10 to ISBN-13', () => {
    expect(isbn10to13('0306406152')).toBe('9780306406157');
    expect(toIsbn13('0-306-40615-2')).toBe('9780306406157');
  });

  it('accepts valid ISBN-13 and rejects bad checksums and non-book EANs', () => {
    expect(toIsbn13('978-0-306-40615-7')).toBe('9780306406157');
    expect(toIsbn13('9780306406158')).toBeNull();
    expect(toIsbn13('4006381333931')).toBeNull();
  });

  it('handles X check digits', () => {
    expect(toIsbn13('080442957X')).toBe('9780804429573');
  });
});

describe('guessCategory', () => {
  it('spots fiction', () => {
    expect(guessCategory(['Science fiction', 'Space travel'])).toBe('fiction');
    expect(guessCategory(['Fiction / Literary'])).toBe('fiction');
  });
  it('defaults to nonfiction', () => {
    expect(guessCategory(['History', 'World War, 1939-1945'])).toBe('nonfiction');
    expect(guessCategory(['Juvenile Nonfiction / Animals'])).toBe('nonfiction');
    expect(guessCategory([])).toBe('nonfiction');
  });
});

describe('parseSeries', () => {
  it('splits a series number off the name', () => {
    expect(__test.parseSeries('Discworld ; 4')).toEqual({ series: 'Discworld', seriesIndex: 4 });
    expect(__test.parseSeries('The Expanse #3')).toEqual({ series: 'The Expanse', seriesIndex: 3 });
    expect(__test.parseSeries('Penguin Classics')).toEqual({ series: 'Penguin Classics', seriesIndex: null });
  });
});

describe('neighborIsbns', () => {
  it('lists valid ISBNs either side, nearest first', () => {
    const n = neighborIsbns('9781400347971');
    // The printed hardcover and Google's listed edition of the same 2026 book are neighbours.
    expect(n[0]).toBe('9781400347988');
    expect(n[1]).toBe('9781400347964');
    expect(n).toHaveLength(6);
    expect(n.every((i) => toIsbn13(i) === i)).toBe(true);
  });
});
