import { AddBook } from '../features/scan/AddBook';
import { ShelvingMode } from '../features/scan/ShelvingMode';
import { BookDetail } from '../features/library/BookDetail';
import { Library } from '../features/library/Library';
import { Labels } from '../features/locations/Labels';
import { ShelfView } from '../features/locations/ShelfView';
import { Shelves } from '../features/locations/Shelves';
import { PickPage } from '../features/picker/PickPage';
import { QueuePage } from '../features/queue/QueuePage';
import { StatsPage } from '../features/stats/StatsPage';
import { Settings } from '../features/settings/Settings';
import { useRoute } from './router';
import { SyncIndicator } from './SyncIndicator';

const NAV = [
  { href: '#/', label: 'Library', icon: '📚', match: ['', 'book', 'queue', 'pick'] },
  { href: '#/add', label: 'Add', icon: '＋', match: ['add'] },
  { href: '#/shelves', label: 'Shelves', icon: '🗄', match: ['shelves', 'shelf', 'shelve', 'labels'] },
  { href: '#/stats', label: 'Stats', icon: '📊', match: ['stats'] },
  { href: '#/settings', label: 'Settings', icon: '⚙', match: ['settings'] },
];

export function App() {
  const { path, params } = useRoute();
  const [section = '', arg = ''] = path;

  let page;
  switch (section) {
    case '':
      page = <Library params={params} key={params.toString()} />;
      break;
    case 'book':
      page = <BookDetail id={arg} key={arg} />;
      break;
    case 'stats':
      page = <StatsPage />;
      break;
    case 'pick':
      page = <PickPage />;
      break;
    case 'queue':
      page = <QueuePage />;
      break;
    case 'add':
      page = <AddBook initialMode={params.get('mode') === 'search' ? 'search' : 'scan'} />;
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
  );
}
