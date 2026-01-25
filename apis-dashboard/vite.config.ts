import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // Shows update notification instead of auto-update
      includeAssets: ['favicon.svg', 'icons/*.svg'],
      manifest: {
        name: 'APIS Dashboard',
        short_name: 'APIS',
        description: 'Anti-Predator Interference System - Beehive Protection Dashboard',
        theme_color: '#f7a42d',
        background_color: '#fbf9e7',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192x192.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          },
          {
            src: '/icons/icon-512x512.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          },
          {
            src: '/icons/icon-maskable-512x512.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Precache all built assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Allow larger files (4MB) to accommodate the app bundle
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Runtime caching for API
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: '0.0.0.0', // Allow access from Docker
    watch: {
      usePolling: true, // Required for Docker volume mounts HMR
    },
  },
})
