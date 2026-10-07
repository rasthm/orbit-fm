import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'ORBIT.FM — Global Web Radio',
        short_name: 'ORBIT.FM',
        description: 'Spin the globe and tune into 38,000+ live radio stations.',
        theme_color: '#07070b',
        background_color: '#07070b',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        categories: ['music', 'entertainment'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === '/api/places',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'rg-places', expiration: { maxEntries: 1, maxAgeSeconds: 7 * 86400 } },
          },
          {
            urlPattern: ({ url }) => /^\/api\/(place|search)\b/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rg-pages',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 300, maxAgeSeconds: 3 * 86400 },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 14 * 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
