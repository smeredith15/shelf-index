import { addDays, today } from '../reading/dates';

export type RangePreset = 'this-year' | 'last-year' | 'last-12' | 'all' | 'custom';
export type CountMode = 'spread' | 'finish';

export interface RangeChoice {
  preset: RangePreset;
  from: string;
  to: string;
}

export const PRESET_LABELS: Record<RangePreset, string> = {
  'this-year': 'This year',
  'last-year': 'Last year',
  'last-12': 'Last 12 months',
  all: 'All time',
  custom: 'Custom',
};

/** Concrete inclusive dates for a choice. All time starts at the earliest read. */
export function resolveRange(choice: RangeChoice, earliest: string | null, now = today()): { from: string; to: string } {
  const year = Number(now.slice(0, 4));
  switch (choice.preset) {
    case 'this-year':
      return { from: `${year}-01-01`, to: now };
    case 'last-year':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case 'last-12':
      return { from: addDays(now, -364), to: now };
    case 'all':
      return { from: earliest && earliest < now ? earliest : now, to: now };
    case 'custom':
      return choice.from <= choice.to ? { from: choice.from, to: choice.to } : { from: choice.to, to: choice.from };
  }
}
