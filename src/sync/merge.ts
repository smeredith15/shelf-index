import type { Syncable } from '../data/models';

export interface MergeResult<T extends Syncable> {
  /** Union of both sides, newest version of each record. */
  merged: T[];
  /** Records where the remote version won and must be written locally. */
  toLocal: T[];
  /** True when the merged set differs from what the remote has. */
  remoteChanged: boolean;
}

/** Last-writer-wins merge by updatedAt. Ties keep the local copy. */
export function mergeRecords<T extends Syncable>(local: T[], remote: T[]): MergeResult<T> {
  const byId = new Map<string, T>();
  const remoteById = new Map<string, T>();
  for (const r of remote) remoteById.set(r.id, r);
  for (const l of local) byId.set(l.id, l);

  const toLocal: T[] = [];
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l || r.updatedAt > l.updatedAt) {
      byId.set(r.id, r);
      toLocal.push(r);
    }
  }

  let remoteChanged = false;
  for (const [id, rec] of byId) {
    const r = remoteById.get(id);
    if (!r || r.updatedAt !== rec.updatedAt) {
      remoteChanged = true;
      break;
    }
  }

  const merged = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { merged, toLocal, remoteChanged };
}
