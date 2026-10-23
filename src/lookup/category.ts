import type { Category } from '../data/models';

const FICTION_HINTS = [
  'fiction',
  'novel',
  'novels',
  'short stories',
  'fantasy',
  'science fiction',
  'mystery',
  'thriller',
  'romance',
  'horror',
  'poetry',
  'drama',
  'detective',
  'literary',
  'fairy tales',
  'comics & graphic novels',
];

const NONFICTION_HINTS = ['nonfiction', 'non-fiction', 'biography', 'history', 'science', 'essays', 'memoir'];

/** Guesses fiction/nonfiction from subject metadata. Always overridable in the UI. */
export function guessCategory(subjects: string[]): Category {
  let fiction = 0;
  let nonfiction = 0;
  for (const raw of subjects) {
    const s = raw.toLowerCase();
    if (/\bnon-?fiction\b/.test(s)) {
      nonfiction += 2;
      continue;
    }
    if (FICTION_HINTS.some((h) => s === h || s.includes(h))) fiction += 1;
    else if (NONFICTION_HINTS.some((h) => s.includes(h))) nonfiction += 1;
  }
  return fiction > nonfiction ? 'fiction' : 'nonfiction';
}
