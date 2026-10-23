import { describe, expect, it } from 'vitest';
import { blankBook } from '../../data/models';
import { moveItem, queueFor, renumber } from './logic';

const q = (id: string, position: number, category: 'fiction' | 'nonfiction' = 'fiction') =>
  blankBook({ id, category, queue: { inQueue: true, position } });

describe('queue', () => {
  it('lists a category in position order', () => {
    const books = [q('a', 2), q('b', 1), q('c', 1, 'nonfiction'), blankBook({ id: 'd', category: 'fiction' })];
    expect(queueFor(books, 'fiction').map((b) => b.id)).toEqual(['b', 'a']);
  });

  it('moves items and renumbers only what changed', () => {
    const list = [q('a', 1), q('b', 2), q('c', 3)];
    const moved = moveItem(list, 2, 0);
    expect(moved.map((b) => b.id)).toEqual(['c', 'a', 'b']);
    expect(renumber(moved).map((b) => [b.id, b.queue.position])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
    expect(renumber(list)).toEqual([]);
  });
});
