import { describe, expect, it } from 'vitest';
import { type Session, blankBook } from '../../data/models';
import { undatedReads } from './undated';

const finished = (bookId: string): Session => ({
  id: 's' + bookId, bookId, start: '2026-01-01', end: '2026-01-05', outcome: 'finished', pauses: [], progress: [], updatedAt: '', deleted: false,
});

describe('undatedReads', () => {
  it('finds read books with no dated read, keeping dismissed ones apart', () => {
    const books = [
      blankBook({ id: 'dated', status: 'read' }),
      blankBook({ id: 'missing', status: 'read' }),
      blankBook({ id: 'dismissed', status: 'read', datesUnknown: true }),
      blankBook({ id: 'unread', status: 'to-read' }),
      blankBook({ id: 'wish', status: 'read', owned: false, collection: 'wishlist' }),
      blankBook({ id: 'gone', status: 'read', deleted: true }),
    ];
    const { missing, dismissed } = undatedReads(books, [finished('dated'), { ...finished('missing'), deleted: true }]);
    expect(missing.map((b) => b.id)).toEqual(['missing']);
    expect(dismissed.map((b) => b.id)).toEqual(['dismissed']);
  });
});
