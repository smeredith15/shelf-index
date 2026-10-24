import { describe, expect, it } from 'vitest';
import { type Session, blankBook } from '../../data/models';
import { calibrate } from '../reading/logic';
import { DEFAULT_FILTERS, candidates, chooseWinner, lastFinishedCategory, startDuel, weight, weightedPick, type Duel } from './logic';

const books = [
  blankBook({ id: 'f1', category: 'fiction', queue: { inQueue: true, position: 1 }, pageCount: 150, addedAt: '2026-10-01T12:00:00Z' }),
  blankBook({ id: 'f2', category: 'fiction', pageCount: 600, owned: false, collection: 'borrowed', addedAt: '2024-10-23T12:00:00Z' }),
  blankBook({ id: 'w1', category: 'fiction', owned: false, collection: 'wishlist' }),
  blankBook({ id: 'n1', category: 'nonfiction', queue: { inQueue: true, position: 1 }, pageCount: 300, addedAt: '2026-04-23T12:00:00Z' }),
  blankBook({ id: 'r1', category: 'fiction', status: 'read' }),
];
const finished = (bookId: string, end: string): Session => ({
  id: 's' + bookId, bookId, start: end, end, outcome: 'finished', pauses: [], progress: [], updatedAt: '', deleted: false,
});
const cal = calibrate(books);
const ids = (list: { id: string }[]) => list.map((b) => b.id);

describe('pick next', () => {
  it('filters by source, category, length and ownership', () => {
    const pick = (patch: object, sessions: Session[] = []) =>
      ids(candidates(books, sessions, { ...DEFAULT_FILTERS, ...patch }, cal, new Map()));
    expect(pick({})).toEqual(['f1', 'n1']);
    expect(pick({ source: 'to-read' })).toEqual(['f1', 'f2', 'n1']);
    expect(pick({ source: 'to-read', length: 'short' })).toEqual(['f1']);
    expect(pick({ source: 'to-read', length: 'long' })).toEqual(['f2']);
    expect(pick({ source: 'to-read', ownedOnly: true })).toEqual(['f1', 'n1']);
    // Alternate: last finished was fiction, so offer nonfiction.
    expect(pick({ category: 'alternate' }, [finished('r1', '2026-10-20')])).toEqual(['n1']);
    expect(lastFinishedCategory(books, [])).toBeNull();
  });

  it('weights books by how long they have waited', () => {
    expect(weight(books[0], '2026-10-23')).toBeCloseTo(1 + 22 / 30);
    expect(weight(books[1], '2026-10-23')).toBeCloseTo(1 + 730 / 30);
    // f2 has waited two years, so it takes most of the range.
    expect(weightedPick(books.slice(0, 2), '2026-10-23', () => 0.5)?.id).toBe('f2');
    expect(weightedPick(books.slice(0, 2), '2026-10-23', () => 0)?.id).toBe('f1');
    expect(weightedPick([], '2026-10-23')).toBeNull();
  });

  it('runs head-to-head until one book is left', () => {
    let duel = startDuel(books.slice(0, 3))!;
    expect(duel.rounds).toBe(2);
    let next = chooseWinner(duel, duel.challengers[0]);
    expect('champion' in next && next.champion.id).toBe('f2');
    duel = next as Duel;
    next = chooseWinner(duel, duel.champion);
    expect((next as { id: string }).id).toBe('f2');
    expect(startDuel(books.slice(0, 1))).toBeNull();
  });
});
