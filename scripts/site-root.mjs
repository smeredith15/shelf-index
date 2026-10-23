// Writes the files served at the old address, /shelf-index/, after the app moved to /shelf-index/app/.
//  - index.html sends visitors (and old bookmarks and shelf links) on to the app, keeping the #route.
//  - sw.js replaces the service worker that used to control /shelf-index/: it clears that worker's
//    caches, unregisters itself and reloads its pages, so they pick up the app's own worker.
//    Browser storage belongs to the whole origin, so the library data is untouched.
import { writeFileSync } from 'node:fs';

const root = new URL('../dist/', import.meta.url);

writeFileSync(
  new URL('index.html', root),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shelf Index</title>
    <script>location.replace('./app/' + location.search + location.hash);</script>
    <meta http-equiv="refresh" content="0; url=./app/" />
  </head>
  <body>
    <p><a href="./app/">Open Shelf Index</a></p>
  </body>
</html>
`,
);

writeFileSync(
  new URL('sw.js', root),
  `// Retires the old /shelf-index/ service worker. Only its own caches are removed: other apps on
// this origin keep theirs, and caches belonging to /shelf-index/app/ are left alone.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      for (const name of await caches.keys()) {
        if (name.includes(scope) && !name.includes(scope + 'app/')) await caches.delete(name);
      }
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })(),
  );
});
`,
);
