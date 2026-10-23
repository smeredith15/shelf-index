import { useMemo } from 'preact/hooks';
import { useLive } from '../../data/hooks';
import { liveBooks, loadSettings } from '../../data/store';
import { type Calibration, calibrate } from './logic';

/** Words per page for each format, recomputed whenever books or settings change. */
export function useCalibration(): Calibration | undefined {
  const books = useLive(liveBooks);
  const settings = useLive(loadSettings);
  return useMemo(
    () => (books && settings ? calibrate(books, settings.defaultWordsPerPage, settings.defaultWordsPerMinute) : undefined),
    [books, settings],
  );
}
