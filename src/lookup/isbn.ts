/** Strips everything but digits and X. */
export function cleanIsbn(input: string): string {
  return input.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  const sum = [...isbn].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return sum % 10 === 0;
}

export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  const sum = [...isbn].reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
  return sum % 11 === 0;
}

export function isbn10to13(isbn10: string): string {
  const core = '978' + isbn10.slice(0, 9);
  const sum = [...core].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return core + ((10 - (sum % 10)) % 10);
}

/** Normalizes any ISBN-10/13 (with or without hyphens) to ISBN-13, or null if it isn't one. */
export function toIsbn13(input: string): string | null {
  const isbn = cleanIsbn(input);
  if (isValidIsbn13(isbn) && (isbn.startsWith('978') || isbn.startsWith('979'))) return isbn;
  if (isValidIsbn10(isbn)) return isbn10to13(isbn);
  return null;
}

function isbn13CheckDigit(body12: string): number {
  const sum = [...body12].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/**
 * ISBNs just either side of this one, nearest first. Publishers usually number a book's editions
 * (hardcover, ebook, audio) consecutively, so a missed ISBN's neighbours often find the same book.
 */
export function neighborIsbns(isbn13: string, span = 3): string[] {
  const prefix = isbn13.slice(0, 3);
  const body = Number(isbn13.slice(3, 12));
  const out: string[] = [];
  for (let d = 1; d <= span; d++) {
    for (const n of [body + d, body - d]) {
      if (n < 0 || n > 999_999_999) continue;
      const body12 = prefix + String(n).padStart(9, '0');
      out.push(body12 + isbn13CheckDigit(body12));
    }
  }
  return out;
}
