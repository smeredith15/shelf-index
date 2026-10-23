import { describe, expect, it } from 'vitest';
import { mergeRecords } from './merge';

interface Rec {
  id: string;
  updatedAt: string;
  deleted: boolean;
  v?: string;
}

const rec = (id: string, updatedAt: string, extra: Partial<Rec> = {}): Rec => ({
  id,
  updatedAt,
  deleted: false,
  ...extra,
});

describe('mergeRecords', () => {
  it('takes the newer version of each record', () => {
    const local = [rec('a', '2026-01-02', { v: 'local' }), rec('b', '2026-01-01', { v: 'local' })];
    const remote = [rec('a', '2026-01-01', { v: 'remote' }), rec('b', '2026-01-03', { v: 'remote' })];
    const out = mergeRecords(local, remote);
    expect(out.merged.map((r) => r.v)).toEqual(['local', 'remote']);
    expect(out.toLocal.map((r) => r.id)).toEqual(['b']);
    expect(out.remoteChanged).toBe(true);
  });

  it('keeps records that only exist on one side', () => {
    const out = mergeRecords([rec('a', '1')], [rec('b', '1')]);
    expect(out.merged.map((r) => r.id)).toEqual(['a', 'b']);
    expect(out.toLocal.map((r) => r.id)).toEqual(['b']);
    expect(out.remoteChanged).toBe(true);
  });

  it('propagates tombstones', () => {
    const out = mergeRecords([rec('a', '1')], [{ ...rec('a', '2'), deleted: true }]);
    expect(out.merged[0].deleted).toBe(true);
    expect(out.remoteChanged).toBe(false);
  });

  it('keeps local on ties and reports no change when identical', () => {
    const out = mergeRecords([rec('a', '1', { v: 'local' })], [rec('a', '1', { v: 'remote' })]);
    expect(out.merged[0].v).toBe('local');
    expect(out.toLocal).toEqual([]);
    expect(out.remoteChanged).toBe(false);
  });
});
