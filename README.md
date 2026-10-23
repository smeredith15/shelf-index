# Shelf Index

A personal book-collection app. Scan books in, record which shelf each one is on, track reading pace in words, and keep a running Up Next queue.

It's a Progressive Web App (PWA) hosted on GitHub Pages. Library data lives in a separate private GitHub repo that the app reads and commits to directly. It's built for one person on three devices (an Android phone, an iPad Air and an iPad mini 4) and isn't meant for distribution.

---

## Why this exists

Existing book apps cover the basics, but none do these three things well (or for free):

1. **Physical locations.** Every shelf of every bookcase gets a label. Each book records which shelf it's on and whether it's in the front or back row, and the location shows as a badge on its cover. The collection never has to stay alphabetized.
2. **Word counts.** Reading is measured in words, not just books or pages: pace within a book, totals for any date range, and projections.
3. **Up Next queue.** A standing queue of 10 fiction and 10 nonfiction books, shown as a scrolling gallery at the top of the home screen.

---

## Features

### Adding books
- Scan the ISBN barcode with the camera
- Search by ISBN, title or author when there's no barcode or a scan fails
- Metadata from Open Library and Google Books: title, authors, page count, publisher, publication year, subjects, series where available
- Choose a cover from the available editions, or photograph your own copy
- Every field can be edited after import

### Library
- **Status:** To Read, Reading, Read or DNF
- **Ownership:** Owned or Not owned. Wishlist books can sit on To Read without a location.
- **Sort:** title, author, date added, date read, length, rating, location
- **Filter:** status, fiction/nonfiction, room, bookcase, shelf, tags, series, ownership
- Ratings, notes, tags, and series with series number
- Rereads: each read is its own session with its own dates
- Search across title, author, ISBN and tags; results show the location badge

### Locations
Locations follow a fixed hierarchy: **room → bookcase → shelf → row (front/back)**.

- **Badge code:** room code · bookcase · shelf. For example, `LR·2·3` is Living Room, bookcase 2, shelf 3.
  - Bookcases are numbered left to right from the room's entrance.
  - Shelves are numbered top to bottom.
  - Back-row books get an outlined badge with a "back" marker.
- **Printable shelf labels:** each label has the code in large text and a QR code that links to that shelf in the app.
- **Shelving mode:**
  1. Scan a shelf label. That shelf becomes the active shelf.
  2. Scan each book's barcode. Each one is assigned to the active shelf, in the front row unless you switch to back row.
  3. Books not yet in the library are looked up and added on the spot.
  4. Scan another shelf label to switch shelves, or tap Done.
- **Shelf view:** everything on one shelf, with front and back rows listed separately. Useful for audits and for remembering what's hidden behind the front row.
- **Bulk move:** move selected books, or a whole shelf's contents, to another shelf.

### Up Next queue
- A horizontally scrolling gallery at the top of the home screen. It can show fiction and nonfiction as two rows, or one row with a toggle.
- Soft limit of 10 per category: going over shows a warning but doesn't block you.
- Drag to reorder.
- Fiction/nonfiction is guessed from subject metadata and can be overridden.
- The physical Up Next shelf is an ordinary location. Optionally, adding a book to the queue moves its location there automatically.

### Reading sessions
- Start, finish, pause, resume or DNF a book.
- Optional progress updates ("page 212 on Oct 23") make pace calculations more accurate.
- Paused time is excluded from pace.

### Word counts
Each book stores a word count along with how it was obtained:

| Source | How | Confidence |
|---|---|---|
| Looked up | Entered from an outside source that lists the book's word count | Best |
| Sampled | You count the words on 5 lines, the lines on a full page, and the body pages (excluding front and back matter). Words = (words ÷ 5) × lines per page × body pages. | Good |
| Audiobook | Length of the unabridged audiobook × narration speed (about 155 words per minute) | Fair, usually within ~10% |
| Estimated | Page count × words per page for the book's format | Rough |

- The default is 275 words per page.
- Once some books have looked-up or sampled counts, the app calculates your own average words per page for each format (mass market, trade paperback, hardcover) and uses that for estimates.
- Once three books have both a looked-up or sampled count and an audiobook length, the app uses your own narration speed instead of 155 words per minute.
- Audiobook lengths have to be typed in (from Audible, Libro.fm or a library app), because no free API provides them. Only use unabridged editions.
- Stats show what share of the totals comes from estimates, so you know how rough the numbers are.

### Stats
- **Date range:** this year, last year, last 12 months, all time, or a custom range.
- **Counting across range boundaries:** a book read across a range boundary can either count fully at its finish date or be spread across the days it was read. Spreading is the default because it gives more accurate pace figures.

**Read**
- Books, pages and words per month
- Words-per-day trend
- Pace per book (words per day from start to finish, minus paused time)
- Year-end projection based on your pace over the last 90 days
- Fiction/nonfiction split, length distribution, top authors and subjects
- Rating distribution, average days to finish, rereads, DNFs

**To Read**
- Total books and total words
- Estimated time to clear the shelf at your current pace
- Owned vs. not owned
- How long books have been waiting, with the oldest unread owned books listed
- Queue makeup

### Pick next
- Random pick from the queue or the whole To Read shelf, with filters (category, length, owned, room)
- Weighted toward books that have waited longest
- **Alternate:** suggests the opposite category from your last finished book
- **Head-to-head:** shows two books at a time, you pick one, and it continues until one is left

### Getting books in from elsewhere
- **Android share sheet:** share a book from Goodreads or StoryGraph to Shelf Index. The app pulls the title from the shared link or text, searches for it, and adds it to To Read as Not owned once you confirm.
- **Paste a link (iPad):** Add → From link does the same thing.
- **CSV import:** import the library exports from Goodreads and StoryGraph. This brings in your to-read list and your read history with dates, so stats cover past years. Imported books start with estimated word counts.

### Discovery (later, best effort)
- More by this author, other books in the same series, browsing by subject (Open Library)
- NYT bestseller lists (needs a free API key)
- Possibly Hardcover's public API
- Goodreads stopped issuing API keys in 2020 and StoryGraph has no public API, so there are no recommendations from either service.

---

## Architecture

```
GitHub Pages                         GitHub (private)
public repo: shelf-index             repo: shelf-index-data
  └─ the app (static files)            ├─ data/books.json
           │                           ├─ data/sessions.json
           ▼                           ├─ data/locations.json
  Device (phone / iPad)                ├─ data/settings.json
  ├─ IndexedDB: working copy ◄─sync─►  └─ covers/<book-id>.jpg
  └─ Service worker: offline app
```

- **Two repos.** The app repo is public, because free GitHub Pages hosting requires that. The data repo is private, so the collection and reading history aren't published.
- **Local first.** Edits are written to IndexedDB immediately, so the app is fast and works offline.
- **Batched commits.** Changes are queued and committed after a short idle delay, and when the app goes to the background. Each batch is one commit, made through the Git Data API so several files can change in a single commit.
- **Merging.** Every record has an `updatedAt` timestamp, and deletes are kept as tombstones. On sync, the newer version of each record wins. If the data repo changed since the last sync (for example, from another device), the app pulls, merges and retries.
- **History.** Every sync is a commit, so the data repo's history doubles as a backup and undo log.
- **Covers.** The chosen cover is saved to the data repo as a compressed JPEG about 400px wide, so it doesn't depend on outside links staying up.

### Planned stack
- Vite + TypeScript
- Preact for the UI (small and quick on the mini 4)
- Dexie for IndexedDB
- `vite-plugin-pwa` (Workbox) for the service worker and manifest
- Barcode scanning: the native `BarcodeDetector` where it exists (Chrome on Android), with a ZXing WebAssembly fallback on iPad
- Chart.js for stats
- A QR generator library for shelf labels

### Project layout (planned)
```
src/
  app/            routing, layout, home screen
  features/
    scan/         camera, barcode decoding, shelving mode
    library/      list/grid, sort, filter, book detail
    locations/    hierarchy, badges, shelf view, label printing
    queue/        Up Next gallery
    reading/      sessions, progress, word counts
    stats/
    picker/
    import/       CSV import, share target, paste-a-link
  data/           Dexie schema, models
  sync/           GitHub client, merge logic
  lookup/         Open Library, Google Books
public/
  manifest.webmanifest
```

---

## Data model

`data/books.json`, one record per book:

```json
{
  "id": "b_7f3k2",
  "isbn13": "9780000000000",
  "title": "Example Title",
  "subtitle": null,
  "authors": ["Author Name"],
  "series": null,
  "seriesIndex": null,
  "publisher": "Publisher",
  "pubYear": 2019,
  "format": "trade",
  "pageCount": 352,
  "bodyPages": 336,
  "category": "fiction",
  "subjects": ["Science fiction"],
  "tags": [],
  "status": "to-read",
  "owned": true,
  "location": { "shelfId": "s_lr_2_3", "row": "back" },
  "queue": { "inQueue": true, "position": 4 },
  "wordCount": { "value": 98000, "source": "sampled" },
  "rating": null,
  "notes": "",
  "cover": "covers/b_7f3k2.jpg",
  "addedAt": "2026-10-23T18:12:00Z",
  "updatedAt": "2026-10-23T18:12:00Z",
  "deleted": false
}
```

`data/sessions.json`, one record per read:

```json
{
  "id": "r_91xq",
  "bookId": "b_7f3k2",
  "start": "2026-09-02",
  "end": "2026-09-19",
  "outcome": "finished",
  "pauses": [{ "from": "2026-09-08", "to": "2026-09-11" }],
  "progress": [{ "date": "2026-09-05", "page": 120 }],
  "updatedAt": "2026-09-19T21:40:00Z",
  "deleted": false
}
```

`data/locations.json` holds rooms (`{ id, name, code }`), bookcases (`{ id, roomId, number, name }`) and shelves (`{ id, bookcaseId, number, hasBackRow }`).

---

## Device support

| Device | OS | Notes |
|---|---|---|
| Android phone | Current Android, Chrome | Full support, including native barcode scanning and the share sheet |
| iPad Air | Current iPadOS | Everything except the share sheet (Safari doesn't support Web Share Target). Scanning uses the WebAssembly fallback. |
| iPad mini 4 | iPadOS 15.8 (final version) | Same as the iPad Air. Scanning may be slower on its older chip. |

To confirm an iPad's model, go to Settings → General → About → Model Name.

### Staying compatible with the iPad mini 4
The mini 4 is permanently on iPadOS 15, so the app has to run on Safari 15.

- Set the Vite build target to `['es2020', 'safari15']`.
- Don't use features Safari 15 lacks: CSS nesting, container queries, `color-mix()`, the Popover API, View Transitions, `OffscreenCanvas`.
- Test UI changes on the mini 4 before merging.

---

## Setup

1. **App repo.** Create the public repo `shelf-index`. In Settings → Pages, set the source to **GitHub Actions**. The included workflow builds and deploys on every push to `main`.
2. **Data repo.** Create the private repo `shelf-index-data` and initialize it with a README so it has a default branch. The app creates the data files on its first sync.
3. **Access token.** Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   - Repository access: **Only select repositories** → `shelf-index-data`
   - Permissions: **Contents → Read and write**
   - Expiration: whatever you're comfortable with. The app asks for a new token when the old one expires.
4. **Install on each device.** Open `https://<username>.github.io/shelf-index/app/` (the bare `/shelf-index/` address redirects there), then:
   - Android (Chrome): menu → **Install app**
   - iPad (Safari): Share → **Add to Home Screen**
5. **Connect sync.** In the app, go to Settings → Sync and enter the repo owner, repo name and token. The token is stored only on that device and never in either repo.
6. **Set up locations.** In Settings → Locations, add your rooms, bookcases and shelves, then use **Print labels** to make the shelf labels.

---

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
npm test          # unit tests (merge, sync against a fake GitHub, lookup, filters)
npm run typecheck
```

The build uses a relative base path and hash routing, so it works from any GitHub Pages URL. The app repo doesn't have to be called `shelf-index`.

The app is built into `dist/app/` and served one level down, at `/shelf-index/app/`. `scripts/site-root.mjs` writes the two files left at `/shelf-index/`: a redirect that keeps the `#` route, and a service worker that retires the one that used to control that folder. The move happened because Chrome on Android kept a stale "already installed" record for the `/shelf-index/` scope that survived changing the manifest `id` and `start_url`. Browser storage belongs to the whole origin, so moving folders doesn't touch the library data.

- **Testing the camera on a device.** Browsers only allow camera access on HTTPS or localhost. To test scanning on the phone or an iPad during development, either run the dev server with `--host` and HTTPS enabled (Vite's basic-ssl plugin), or test the deployed build.
- **Test data.** Point dev builds at a separate test data repo so experiments don't touch the real library.

---

## Roadmap

**Phase 1: Catalog and locations**
- [x] App shell, PWA install, offline support
- [x] Data model and IndexedDB storage
- [x] GitHub sync: pull, merge, batched commits
- [x] Barcode scanning and manual search
- [x] Cover picker and photographed covers
- [x] Library grid/list with sort, filter and search
- [x] Locations, cover badges, shelf view, bulk move
- [x] Printable shelf labels and shelving mode

**Phase 2: Reading**
- [x] Reading sessions, rereads, DNF, pause/resume
- [x] Progress updates
- [x] Word counts (looked up, sampled, estimated) with per-format calibration
- [x] Up Next gallery

**Phase 3: Insight**
- [ ] Stats for Read and To Read, with a date-range picker
- [ ] Pick-next helper

**Phase 4: Getting books in**
- [ ] Android share target
- [ ] Paste-a-link
- [ ] Goodreads and StoryGraph CSV import
- [ ] Discovery

---

## Known limitations

- **No share sheet on iPad**, because Safari doesn't support the Web Share Target API. Use paste-a-link instead.
- **Word counts are estimates** unless they're looked up or sampled. Stats show how much of each total is estimated.
- **The iPad mini 4 is frozen on iPadOS 15.8**, so new browser features can't be used until it's retired.
- **Tokens expire.** When the GitHub token runs out, sync pauses until a new one is entered on each device.
