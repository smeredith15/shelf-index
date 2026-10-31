import type { Session } from '../../data/models';
import { addDays, eachDay } from '../reading/dates';

/**
 * Spreads one read across the days it happened, as a fraction of the book per day.
 * Progress updates split the read into segments, so a fast weekend and a slow week land where
 * they belong; paused days get nothing. Finished reads add up to 1; unfinished ones stop at the
 * last progress update.
 */
/** `pages` is the book's reading length (body pages when known), so a logged page maps to a fraction. */
export function dailyFractions(session: Session, pages: number | null, asOf: string): Map<string, number> {
  const out = new Map<string, number>();
  const end = session.end ?? asOf;
  if (end < session.start) return out;

  const checkpoints: { date: string; f: number }[] = [{ date: session.start, f: 0 }];
  if (pages) {
    const progress = [...session.progress]
      .filter((p) => p.date >= session.start && p.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date) || a.page - b.page);
    for (const p of progress) {
      const f = Math.min(1, p.page / pages);
      const last = checkpoints[checkpoints.length - 1];
      if (f <= last.f) continue;
      if (p.date === last.date && checkpoints.length > 1) last.f = f;
      else checkpoints.push({ date: p.date, f });
    }
  }
  if (session.outcome === 'finished') {
    const last = checkpoints[checkpoints.length - 1];
    if (last.date === end && checkpoints.length > 1) last.f = 1;
    else checkpoints.push({ date: end, f: 1 });
  }

  const paused = (d: string) => session.pauses.some((p) => d >= p.from && (p.to === null || d < p.to));

  for (let i = 1; i < checkpoints.length; i++) {
    const a = checkpoints[i - 1];
    const b = checkpoints[i];
    const share = b.f - a.f;
    if (share <= 0) continue;
    // The first segment includes the start day; later ones begin the day after the previous update.
    const days = eachDay(i === 1 ? a.date : addDays(a.date, 1), b.date).filter((d) => !paused(d));
    const targets = days.length ? days : [b.date];
    for (const d of targets) out.set(d, (out.get(d) ?? 0) + share / targets.length);
  }
  return out;
}
