import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Build-time define to strip DEV_MODE bypass from production builds
  // In production, DEV_MODE is always false regardless of env var
  define: {
    // SECURITY (S4-H3): Force DEV_MODE to false in all builds except explicit 'development'.
    // This prevents authentication bypass code from being active in staging, test,
    // or any non-development build mode. Uses Vite's dead code elimination.
    '__DEV_MODE__': mode === 'development' ? 'import.meta.env.VITE_DEV_MODE === "true"' : 'false',
  },

  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // Shows update notification instead of auto-update
      includeAssets: ['favicon.svg', 'icons/*.svg'],
      manifest: {
        name: 'Hive Warden',
        short_name: 'Hive Warden',
        description: 'Hive Warden - Beehive Protection Dashboard',
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
        // Only precache critical assets (not lazy chunks)
        // This keeps precache under 2MB limit
        globPatterns: ['**/*.{css,html,ico,png,svg,woff,woff2}'],

        // SECURITY (PWA-001-3): Never cache sensitive endpoints
        // These patterns exclude auth/security endpoints from any caching
        navigateFallbackDenylist: [
          /^\/api\/auth\//,      // Authentication endpoints
          /^\/api\/users\//,     // User data endpoints
          /^\/callback/,         // OIDC callback
        ],

        // Lazy chunks use runtime caching (loaded on demand, cached after first use)
        runtimeCaching: [
          // SECURITY (PWA-001-3): Explicitly exclude sensitive API endpoints from caching
          // These should NEVER be cached to prevent token/session leakage
          {
            urlPattern: /\/api\/auth\/.*/i,
            handler: 'NetworkOnly', // Never cache auth endpoints
          },
          {
            urlPattern: /\/api\/users\/me/i,
            handler: 'NetworkOnly', // Never cache user session data
          },
          // API responses - NetworkFirst to always prefer fresh data
          // SECURITY (S4-H2): Changed from StaleWhileRevalidate to NetworkFirst
          // to prevent serving cached API data across user sessions.
          // Note: Auth endpoints are excluded above via NetworkOnly rules.
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5, // 5 minutes (short TTL for offline fallback only)
              },
              cacheableResponse: {
                statuses: [200],
              },
              networkTimeoutSeconds: 10, // Fall back to cache after 10s timeout
            },
          },
          // JS chunks - cache first after initial load (30 days)
          // This enables instant navigation after first visit
          {
            urlPattern: /\/assets\/.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'js-chunks',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Map tiles - cache for offline use
          {
            urlPattern: /^https:\/\/.*tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
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

  build: {
    rollupOptions: {
      output: {
        // Function-based chunks handle transitive dependencies better than object config
        manualChunks(id) {
          // Vendor: React core (~45KB gzip)
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }

          // Vendor: Ant Design (~180KB gzip)
          if (
            id.includes('node_modules/antd/') ||
            id.includes('node_modules/@ant-design/icons/') ||
            id.includes('node_modules/@ant-design/cssinjs/') ||
            id.includes('node_modules/rc-') // Ant Design's RC components
          ) {
            return 'vendor-antd';
          }

          // Vendor: Refine (~60KB gzip)
          if (id.includes('node_modules/@refinedev/')) {
            return 'vendor-refine';
          }

          // Vendor: Charts - lazy loaded (~120KB gzip)
          if (
            id.includes('node_modules/@ant-design/charts/') ||
            id.includes('node_modules/@antv/')
          ) {
            return 'vendor-charts';
          }

          // Vendor: Maps - lazy loaded (~50KB gzip)
          if (
            id.includes('node_modules/leaflet/') ||
            id.includes('node_modules/react-leaflet/')
          ) {
            return 'vendor-maps';
          }

          // Vendor: Dates (~20KB gzip)
          if (
            id.includes('node_modules/date-fns/') ||
            id.includes('node_modules/dayjs/')
          ) {
            return 'vendor-dates';
          }

          // Vendor: Offline/PWA (~15KB gzip)
          if (
            id.includes('node_modules/dexie/') ||
            id.includes('node_modules/workbox-')
          ) {
            return 'vendor-offline';
          }

          // Vendor: QR - lazy loaded (~45KB gzip)
          if (
            id.includes('node_modules/html5-qrcode/') ||
            id.includes('node_modules/qrcode/')
          ) {
            return 'vendor-qr';
          }

          // Vendor: Auth
          if (id.includes('node_modules/oidc-client-ts/') || id.includes('node_modules/react-oidc-context/')) {
            return 'vendor-auth';
          }

          // Vendor: Utils
          if (id.includes('node_modules/lodash')) {
            return 'vendor-utils';
          }

          // Vendor: Axios
          if (id.includes('node_modules/axios/')) {
            return 'vendor-axios';
          }
        },
      },
    },
    // Warn if any chunk exceeds 500KB (should stay under for PWA)
    chunkSizeWarningLimit: 500,
  },

  server: {
    port: 5173,
    host: '0.0.0.0', // Allow access from Docker
    watch: {
      usePolling: true, // Required for Docker volume mounts HMR
    },
  },
}))
