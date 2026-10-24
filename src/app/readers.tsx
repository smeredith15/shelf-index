import { createContext, type ComponentChildren } from 'preact';
import { useContext, useMemo } from 'preact/hooks';
import { useLive } from '../data/hooks';
import { liveSessions } from '../data/reading';
import { loadSettings } from '../data/store';

interface Readers {
  /** Books with at least one finished read: the green dot. */
  readByMe: Set<string>;
  partnerName: string;
}

const ReadersContext = createContext<Readers>({ readByMe: new Set(), partnerName: 'Partner' });

/** One subscription for the whole app, so every cover doesn't query reads itself. */
export function ReadersProvider({ children }: { children: ComponentChildren }) {
  const sessions = useLive(liveSessions);
  const settings = useLive(loadSettings);
  const value = useMemo<Readers>(
    () => ({
      readByMe: new Set((sessions ?? []).filter((s) => s.outcome === 'finished').map((s) => s.bookId)),
      partnerName: settings?.partnerName || 'Partner',
    }),
    [sessions, settings],
  );
  return <ReadersContext.Provider value={value}>{children}</ReadersContext.Provider>;
}

export function useReaders(): Readers {
  return useContext(ReadersContext);
}
