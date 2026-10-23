import type { Bookcase, Room, Shelf, SyncedSettings } from '../data/models';

export const PATHS = {
  books: 'data/books.json',
  sessions: 'data/sessions.json',
  locations: 'data/locations.json',
  settings: 'data/settings.json',
} as const;

export function coverPath(bookId: string): string {
  return `covers/${bookId}.jpg`;
}

export interface LocationsFile {
  rooms: Room[];
  bookcases: Bookcase[];
  shelves: Shelf[];
}

/** One record per line, so the data repo's history shows readable per-record diffs. */
export function serializeList(records: unknown[]): string {
  if (records.length === 0) return '[]\n';
  return `[\n${records.map((r) => '  ' + JSON.stringify(r)).join(',\n')}\n]\n`;
}

export function serializeLocations(file: LocationsFile): string {
  const indent = (s: string) => s.trimEnd().replace(/\n/g, '\n  ');
  return (
    `{\n  "rooms": ${indent(serializeList(file.rooms))},\n` +
    `  "bookcases": ${indent(serializeList(file.bookcases))},\n` +
    `  "shelves": ${indent(serializeList(file.shelves))}\n}\n`
  );
}

export function serializeSettings(settings: SyncedSettings): string {
  return JSON.stringify(settings, null, 2) + '\n';
}

export function parseList<T>(text: string | null): T[] {
  if (!text) return [];
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

export function parseLocations(text: string | null): LocationsFile {
  if (!text) return { rooms: [], bookcases: [], shelves: [] };
  const parsed = JSON.parse(text) as Partial<LocationsFile>;
  return { rooms: parsed.rooms ?? [], bookcases: parsed.bookcases ?? [], shelves: parsed.shelves ?? [] };
}

export function parseSettings(text: string | null): SyncedSettings | null {
  return text ? (JSON.parse(text) as SyncedSettings) : null;
}
