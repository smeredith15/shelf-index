# Shelf Index

A personal book-collection app. Scan books in, record which shelf each one is on, track reading pace in words, and keep a running Up Next queue.

It's a Progressive Web App (PWA) hosted on Cloudflare Pages. Library data lives in a separate private GitHub repo that the app reads and commits to directly. It's built for one person on three devices (an Android phone, an iPad Air and an iPad mini 4) and isn't meant for distribution.

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
- Metadata from Open Library, Google Books and Apple Books: title, authors, page count, publisher, publication year, subjects, series where available
- Choose a cover from the available editions, or photograph your own copy
- Every field can be edited after import
- **When an ISBN isn't found** (common for brand-new books, which sources often list under a different edition's ISBN), the app checks the ISBNs either side of it, since publishers usually number a book's editions consecutively, and offers any match as "tap yours". If nothing nearby matches, it switches to title search. Either way the book is saved with the ISBN you scanned, so scanning it later finds it.
- **Apple Books** (the public iTunes Search API, no key) usually lists new releases as ebooks on day one, often before Google's API returns them, so it's searched alongside the others, including for nearby editions. It's called via JSONP because the API doesn't allow cross-site requests. When a search finds nothing, the app shows what each source returned.
- **Google Books API key (optional):** without one, Google's shared anonymous quota sometimes runs out and searches miss books. The app says when that happens; Settings → Book lookups explains how to add a free key.

### Library
- **Status:** Owned (the default), Borrowed or Wishlist. Wishlist books live in the Discover tab, not the library.
- **Reading:** blank (the default: no plans to read it), To Read, Reading, Read or DNF, in its own dropdown. It updates itself when you start, finish, DNF or add a past read, and adding a book to Up Next or the radar makes it To Read. Select several books in the library to set their reading status at once.
- **Read dots:** a green dot in the cover's top corner for books you've read, and a blue dot for books the other reader has read, matching the dots on the real shelves. Mark the blue dot on a book's page or for several selected books at once; its name is set in Settings → Readers.
- **Sort:** title, author, date added, date read, length, rating, location
- **Filter:** reading status, fiction/nonfiction, owned or borrowed, read by the other reader, room, bookcase, shelf, tags, series
- Opening a book and coming back returns to the same place in the list with the same filters
- Ratings, notes, tags, and series with series number
- Rereads: each read is its own session with its own dates
- Search across title, author, ISBN and tags; results show the location badge

### Locations
Locations follow a fixed hierarchy: **room → bookcase → shelf → row (front/back)**.

- **Badge code:** room code · bookcase · shelf. For example, `LR·2·3` is Living Room, bookcase 2, shelf 3.
  - Bookcases are numbered left to right from the room's entrance.
  - Shelves are numbered top to bottom.
  - Back-row books get an outlined badge with a "back" marker.
- **Ebooks:** Ebooks appears as a room. Its second dropdown is where the ebook is saved (Kindle, Libby, Apple Books…), with no shelf or row, and the badge shows that name. Choosing an ebook place sets the format to Ebook. Ebook places don't get printed labels.
- **Printable shelf labels:** each label has the code in large text and a QR code that links to that shelf in the app.
- **Shelving mode:**
  1. Scan a shelf label. That shelf becomes the active shelf.
  2. Scan each book's barcode. Each one is assigned to the active shelf, in the front row unless you switch to back row.
  3. Books not yet in the library are looked up and added on the spot.
  4. Scan another shelf label to switch shelves, or tap Done.
- **Shelf view:** everything on one shelf, with front and back rows listed separately. Useful for audits and for remembering what's hidden behind the front row.
- **Bulk move:** move selected books, or a whole shelf's contents, to another shelf.

### Up Next tab
The Up Next tab (in place of Discover for now; Discover is linked from it) has the queue at the top, then:
- **On the radar:** books pinned with 📌 that you're thinking of queueing soon, at the top of the list. Queueing one unpins it.
- **To Read:** every book marked To Read, owned, borrowed or on the wishlist, with sort and fiction/nonfiction filters.
- **Next in series:** finishing a book with a series and number puts the next one on To Read, if this is the furthest you've read in the series. Series names match loosely ("Millennium series" = "The Millennium Trilogy" = "Millennium"). If the next book is in the library with no plans, it's marked To Read. If it can't be matched by series, its real title is looked up on Wikidata and the library is checked for that title, so a sequel added without series details is still found (and gets them filled in). Only if it truly isn't in the library does a placeholder go on To Read, named after the real book when Wikidata knows it ("Discworld #5" otherwise), with a **Find** button that swaps in the real book. Placeholders disappear by themselves once the real book is saved into that slot.

### Series
- **Series page** (tap the series under a book's title, or Library → Filter → Browse series): every book in the series in order, from Wikidata, each marked as in your library (with reading status and read dots) or not, with **Add** for missing ones. Books you own under that title but not filed in the series get a **Set as #N** button (or update them all at once). Rename a series for all its books in one go. When Wikidata doesn't know a series, the page lists the books in your library.
- **Series details filled in for you:** adding a book looks up its series and number on Wikidata when they're missing, and Settings → Book lookups → **Fill in series** does the same for books already in the library.

### Up Next queue
- A horizontally scrolling gallery at the top of the home screen. It can show fiction and nonfiction as two rows, or one row with a toggle.
- Soft limit of 10 per category: going over shows a warning but doesn't block you.
- Drag to reorder.
- Fiction/nonfiction is guessed from subject metadata and can be overridden.
- The physical Up Next shelf is an ordinary location. Optionally, adding a book to the queue moves its location there automatically.

### Reading sessions
- A **Now reading** row at the top of the home screen, above Up Next, shows each book in progress with its page, progress bar, day count and whether it's paused.
- Start, finish, pause, resume or DNF a book.
- Books marked Read with no dates are flagged at the top of Stats ("4 read books have no dates"), since stats can only count dated reads. The review list lets you open each one to add a past read, or choose **Don't know** to stop it being flagged (restorable later). A book's page offers the same two choices.
- Progress, pace and pages-read stats are measured against body pages when you've entered them, and total pages otherwise.
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
- **Android share sheet:** share a book from Goodreads or StoryGraph to Shelf Index. The app pulls the title from the shared link or text, searches for it, and adds it to the Wishlist in Discover once you confirm.
- **Paste a link (iPad):** Add → From link does the same thing.
- **CSV import:** import the library exports from Goodreads and StoryGraph. This brings in your to-read list and your read history with dates, so stats cover past years. Imported books start with estimated word counts.

### Discover
A tab for books you don't have yet: the **Wishlist** (with Got it and Borrowed buttons to move a book into the library), and later **recommendations**. Books shared in from Goodreads or StoryGraph land in the Wishlist.

Recommendations (later, best effort):
- More by this author, other books in the same series, browsing by subject (Open Library)
- NYT bestseller lists (needs a free API key)
- Possibly Hardcover's public API
- Goodreads stopped issuing API keys in 2020 and StoryGraph has no public API, so there are no recommendations from either service.

---

## Architecture

```
Cloudflare Pages                     GitHub (private)
public repo: shelf-index             repo: shelf-index-data
  └─ the app (static files)            ├─ data/books.json
           │                           ├─ data/sessions.json
           ▼                           ├─ data/locations.json
  Device (phone / iPad)                ├─ data/settings.json
  ├─ IndexedDB: working copy ◄─sync─►  └─ covers/<book-id>.jpg
  └─ Service worker: offline app
```

- **Two repos.** The app repo holds only code; Cloudflare Pages builds and serves it from its own address. The data repo is private, so the collection and reading history aren't published.
- **Its own origin.** The app has a web address to itself rather than a folder on a shared `github.io` site. Browser storage and Chrome's record of installed apps are kept per origin, so sharing one with other apps meant a stuck install record for the site blocked installing Shelf Index on Android.
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
- Stats charts drawn as small SVG components (no chart library), following one validated colour palette
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
  "collection": "owned",
  "partnerRead": false,
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

`data/locations.json` holds rooms (`{ id, name, code, ebook? }`; the Ebooks room has `ebook: true`), bookcases (`{ id, roomId, number, name }`) and shelves (`{ id, bookcaseId, number, hasBackRow }`).

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

1. **App hosting.** In the Cloudflare dashboard, go to Workers & Pages → Create → Pages → Connect to Git and pick the `shelf-index` repo. Use build command `npm run build` and output directory `dist`. Cloudflare rebuilds on every push to `main` and serves the app at `https://<project>.pages.dev/`. (`.nvmrc` pins Node 22 for the build.)
2. **Data repo.** Create the private repo `shelf-index-data` and initialize it with a README so it has a default branch. The app creates the data files on its first sync.
3. **Access token.** Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   - Repository access: **Only select repositories** → `shelf-index-data`
   - Permissions: **Contents → Read and write**
   - Expiration: whatever you're comfortable with. The app asks for a new token when the old one expires.
4. **Install on each device.** Open `https://<project>.pages.dev/`, then:
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

The build uses a relative base path and hash routing, so it works at the root of an address or in a folder.

The GitHub Actions workflow runs the tests on every push and keeps the old address, `smeredith15.github.io/shelf-index/`, forwarding to `shelf-index.pages.dev`. `scripts/pages-redirect.mjs` builds that forwarding site, including service workers that retire the ones left on devices from when the app was served there.


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
- [x] Stats for Read and To Read, with a date-range picker
- [x] Pick-next helper

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
