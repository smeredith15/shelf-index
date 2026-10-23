// Builds the site still served at smeredith15.github.io/shelf-index/, which now only forwards to the
// app's own address. Chrome on Android wouldn't install new apps on the shared github.io origin.
//  - index.html (at the root and at app/, where the app briefly lived) forwards, keeping the #route.
//  - sw.js at both places replaces the service workers that used to control them: it deletes only
//    its own caches, unregisters, and reloads its pages so they reach the forwarding page.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const TARGET = 'https://shelf-index.pages.dev/';
const out = new URL('../pages/', import.meta.url);

const redirect = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shelf Index has moved</title>
    <script>location.replace(${JSON.stringify(TARGET)} + location.search + location.hash);</script>
    <meta http-equiv="refresh" content="0; url=${TARGET}" />
  </head>
  <body>
    <p>Shelf Index has moved to <a href="${TARGET}">${TARGET}</a>.</p>
  </body>
</html>
`;

const retire = `// Retires a Shelf Index service worker left from when the app was served here.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      // Workbox names its caches after the registration scope; other apps' caches are left alone.
      for (const name of await caches.keys()) if (name.endsWith(scope)) await caches.delete(name);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })(),
  );
});
`;

rmSync(out, { recursive: true, force: true });
for (const dir of ['', 'app/']) {
  mkdirSync(new URL(dir, out), { recursive: true });
  writeFileSync(new URL(dir + 'index.html', out), redirect);
  writeFileSync(new URL(dir + 'sw.js', out), retire);
}
writeFileSync(new URL('404.html', out), redirect);
