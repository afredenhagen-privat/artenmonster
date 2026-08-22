import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages liefert unter /artenmonster/ aus, lokal unter /
  base: process.env.DEPLOY_TARGET === 'gh-pages' ? '/artenmonster/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Kein includeAssets: die globPatterns unten fassen svg und png schon,
      // sonst stehen Favicon und Icons doppelt im Precache-Manifest.
      manifest: {
        name: 'Artenmonster',
        short_name: 'Artenmonster',
        description: 'Errate das Tier anhand seines Platzes im Stammbaum des Lebens.',
        theme_color: '#0f766e',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Spielkern-Daten kommen fest mit ins Precache: damit ist das Spiel offline spielbar.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'data/{tree,animals,search,meta}.json'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Steckbriefe und Gruppenerklaerungen: erst bei Bedarf, danach dauerhaft.
            urlPattern: /\/data\/(blurbs|gruppen)\.[a-z]{2}\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'artenmonster-blurbs' },
          },
          {
            // Tierbilder liegen bewusst nicht im Bundle. Einmal gesehen heisst aber
            // dauerhaft im Cache, damit alte Runden auch offline ihr Foto behalten.
            urlPattern: /^https:\/\/(commons\.wikimedia\.org|upload\.wikimedia\.org)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'artenmonster-bilder',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
