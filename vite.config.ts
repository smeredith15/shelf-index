import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Hash routing + a relative base means the build works from any GitHub Pages path.
export default defineConfig({
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  build: {
    // The app lives one level down, at /shelf-index/app/: Chrome on Android held a stale install
    // record for the /shelf-index/ scope. scripts/site-root.mjs fills in the old address.
    outDir: 'dist/app',
    // The iPad mini 4 is frozen on iPadOS 15.8 (Safari 15).
    target: ['es2020', 'safari15'],
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        // Stable identity, independent of start_url, so Chrome never confuses installs.
        id: '/shelf-index/app/',
        name: 'Shelf Index',
        short_name: 'Shelf Index',
        description: 'Personal book collection: shelves, reading and word counts.',
        start_url: './?source=pwa',
        scope: './',
        display: 'standalone',
        background_color: '#f6f3ee',
        theme_color: '#3b2f2a',
        // PNG only: Android builds its installed app from these, and an SVG with sizes "any" gets
        // picked first and can leave Chrome thinking the app is installed when the install failed.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
