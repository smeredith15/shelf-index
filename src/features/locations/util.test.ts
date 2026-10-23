import { describe, expect, it } from 'vitest';
import { badgeCode, resolveShelves, shelfIdFromScan } from './util';
import type { Bookcase, Room, Shelf } from '../../data/models';

const base = { updatedAt: '2026-01-01T00:00:00Z', deleted: false };
const rooms: Room[] = [
  { id: 'rm_lr', name: 'Living Room', code: 'LR', ...base },
  { id: 'rm_br', name: 'Bedroom', code: 'BR', ...base },
];
const bookcases: Bookcase[] = [
  { id: 'bc_1', roomId: 'rm_lr', number: 2, name: '', ...base },
  { id: 'bc_2', roomId: 'rm_br', number: 1, name: '', ...base },
];
const shelves: Shelf[] = [
  { id: 's_a', bookcaseId: 'bc_1', number: 3, hasBackRow: true, ...base },
  { id: 's_b', bookcaseId: 'bc_2', number: 1, hasBackRow: false, ...base },
  { id: 's_orphan', bookcaseId: 'bc_missing', number: 1, hasBackRow: false, ...base },
];

describe('locations', () => {
  it('builds badge codes as room·bookcase·shelf', () => {
    expect(badgeCode({ code: 'LR' }, { number: 2 }, { number: 3 })).toBe('LR·2·3');
  });

  it('resolves shelves, skipping orphans, sorted by room name', () => {
    const resolved = resolveShelves({ rooms, bookcases, shelves });
    expect([...resolved.values()].map((r) => r.code)).toEqual(['BR·1·1', 'LR·2·3']);
    expect(resolved.has('s_orphan')).toBe(false);
  });

  it('reads shelf ids out of label QR codes', () => {
    expect(shelfIdFromScan('https://me.github.io/books/#/shelf/s_ab12cd')).toBe('s_ab12cd');
    expect(shelfIdFromScan('9780000000002')).toBeNull();
  });
});
