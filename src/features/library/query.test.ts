import { describe, expect, it } from 'vitest';
import { blankBook } from '../../data/models';
import { EMPTY_FILTERS, authorKey, filterBooks, sortBooks, sortableTitle } from './query';

const books = [
  blankBook({ id: 'b1', title: 'The Martian', authors: ['Andy Weir'], category: 'fiction', tags: ['space'] }),
  blankBook({ id: 'b2', title: 'A Brief History of Time', authors: ['Stephen Hawking'], owned: false, collection: 'borrowed', partnerRead: true }),
  blankBook({ id: 'b3', title: 'Artemis', authors: ['Andy Weir'], isbn13: '9780553448122', status: 'read' }),
  blankBook({ id: 'b4', title: 'Gone', authors: ['X'], deleted: true }),
  // An older record with only owned: false reads as Wishlist, which lives in Discover.
  blankBook({ id: 'b5', title: 'Wanted', authors: ['Y'], owned: false, collection: undefined }),
];

describe('library query', () => {
  it('ignores leading articles and sorts authors by surname', () => {
    expect(sortableTitle('The Martian')).toBe('martian');
    expect(authorKey(['Andy Weir'])).toBe('weir andy');
  });

  it('filters by text across fields and ISBN, and hides tombstones', () => {
    const f = (patch: object) => filterBooks(books, { ...EMPTY_FILTERS, ...patch }, new Map()).map((b) => b.id);
    expect(f({})).toEqual(['b1', 'b2', 'b3']);
    expect(f({ text: 'weir' })).toEqual(['b1', 'b3']);
    expect(f({ text: '978-0553448122' })).toEqual(['b3']);
    expect(f({ text: 'space' })).toEqual(['b1']);
    expect(f({ collection: 'borrowed' })).toEqual(['b2']);
    expect(f({ collection: 'owned' })).toEqual(['b1', 'b3']);
    expect(f({ partnerRead: 'yes' })).toEqual(['b2']);
    expect(f({ partnerRead: 'no' })).toEqual(['b1', 'b3']);
    expect(f({ status: 'read' })).toEqual(['b3']);
    expect(f({ category: 'fiction' })).toEqual(['b1']);
  });

  it('sorts by title and author', () => {
    const live = books.filter((b) => !b.deleted && b.id !== 'b5');
    expect(sortBooks(live, 'title', new Map()).map((b) => b.id)).toEqual(['b3', 'b2', 'b1']);
    expect(sortBooks(live, 'author', new Map()).map((b) => b.id)).toEqual(['b2', 'b3', 'b1']);
  });
});
