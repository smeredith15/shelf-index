import { AddBook } from '../features/scan/AddBook';
import { ShelvingMode } from '../features/scan/ShelvingMode';
import { BookDetail } from '../features/library/BookDetail';
import { Library } from '../features/library/Library';
import { Labels } from '../features/locations/Labels';
import { ShelfView } from '../features/locations/ShelfView';
import { Shelves } from '../features/locations/Shelves';
import { DiscoverPage } from '../features/discover/DiscoverPage';
import { PickPage } from '../features/picker/PickPage';
import { QueuePage } from '../features/queue/QueuePage';
import { UpNextPage } from '../features/queue/UpNextPage';
import { SeriesIndexPage, SeriesPage } from '../features/series/SeriesPage';
import { StatsPage } from '../features/stats/StatsPage';
import { UndatedPage } from '../features/reading/UndatedPage';
import { Settings } from '../features/settings/Settings';
import { useEffect } from 'preact/hooks';
import { useLive } from '../data/hooks';
import { loadSettings } from '../data/store';
import { setGoogleBooksKey } from '../lookup/lookup';
import { ReadersProvider } from './readers';
import { useRoute } from './router';
import { SyncIndicator } from './SyncIndicator';

const NAV = [
  { href: '#/', label: 'Library', icon: '📚', match: ['', 'book', 'series'] },
  { href: '#/add', label: 'Add', icon: '＋', match: ['add'] },
  { href: '#/shelves', label: 'Shelves', icon: '🗄', match: ['shelves', 'shelf', 'shelve', 'labels'] },
  { href: '#/upnext', label: 'Up Next', icon: '🔖', match: ['upnext', 'queue', 'pick', 'discover'] },
  { href: '#/stats', label: 'Stats', icon: '📊', match: ['stats', 'undated'] },
  { href: '#/settings', label: 'Settings', icon: '⚙', match: ['settings'] },
];

export function App() {
  const { path, params } = useRoute();
  const settings = useLive(loadSettings);
  useEffect(() => setGoogleBooksKey(settings?.googleBooksKey), [settings?.googleBooksKey]);
  const [section = '', arg = ''] = path;

  let page;
  switch (section) {
    case '':
      page = <Library params={params} key={params.toString()} />;
      break;
    case 'book':
      page = <BookDetail id={arg} key={arg} />;
      break;
    case 'series':
      page = arg ? <SeriesPage name={decodeURIComponent(arg)} key={arg} /> : <SeriesIndexPage />;
      break;
    case 'upnext':
      page = <UpNextPage />;
      break;
    case 'discover':
      page = <DiscoverPage />;
      break;
    case 'stats':
      page = <StatsPage />;
      break;
    case 'undated':
      page = <UndatedPage />;
      break;
    case 'pick':
      page = <PickPage />;
      break;
    case 'queue':
      page = <QueuePage />;
      break;
    case 'add':
      page = (
        <AddBook
          key={params.toString()}
          initialMode={params.get('mode') === 'search' ? 'search' : 'scan'}
          collection={params.get('collection') === 'wishlist' ? 'wishlist' : 'owned'}
          initialIsbn={params.get('isbn')}
          initialQuery={params.get('q')}
          replaceId={params.get('replace')}
        />
      );
      break;
    case 'shelves':
      page = <Shelves />;
      break;
    case 'shelf':
      page = <ShelfView id={arg} key={arg} />;
      break;
    case 'shelve':
      page = <ShelvingMode initialShelf={params.get('shelf')} />;
      break;
    case 'labels':
      page = <Labels />;
      break;
    case 'settings':
      page = <Settings section={arg} />;
      break;
    default:
      page = (
        <div class="page">
          <p>
            Page not found. <a href="#/">Go to the library</a>
          </p>
        </div>
      );
  }

  return (
    <ReadersProvider>
    <div class="app">
      <header class="topbar no-print">
        <a href="#/" class="brand">
          Shelf Index
        </a>
        <SyncIndicator />
      </header>
      <main>{page}</main>
      <nav class="tabbar no-print">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} class={n.match.includes(section) ? 'active' : ''}>
            <span class="tab-icon" aria-hidden="true">
              {n.icon}
            </span>
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
    </ReadersProvider>
  );
}
