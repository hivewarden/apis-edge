# Story 7.1: Service Worker & App Shell Caching

Status: done

## Story

As a **beekeeper**,
I want the app to load even without internet,
So that I can use it in the field where signal is poor.

## Acceptance Criteria

1. **Given** I have visited the app before **When** I open it without internet connection **Then**:
   - The app shell loads from cache
   - I see the navigation and UI layout
   - A banner indicates "Offline mode"

2. **Given** I install the PWA **When** I add it to my home screen **Then**:
   - It appears as a standalone app
   - Opens in full-screen mode (no browser chrome)
   - Displays the APIS icon and splash screen

3. **Given** the app is online **When** a new version is deployed **Then**:
   - The service worker detects the update
   - Shows a "New version available" notification
   - User can click to refresh and get updates

4. **Given** critical resources fail to cache **When** the service worker registers **Then**:
   - Errors are logged to console
   - The app falls back to online-only mode gracefully

## Tasks / Subtasks

### Task 1: PWA Dependencies & Build Configuration (AC: #1, #2, #3)
- [x] 1.1 Install vite-plugin-pwa and workbox-window packages
- [x] 1.2 Configure vite.config.ts with VitePWA plugin
- [x] 1.3 Configure precache manifest (HTML, JS, CSS bundles, fonts, icons)
- [x] 1.4 Configure runtime caching strategies:
  - API GET requests: stale-while-revalidate
  - API POST/PUT/DELETE: network-only (handled by sync in 7-4)
- [x] 1.5 Verify build output includes service worker files

### Task 2: PWA Manifest Configuration (AC: #2)
- [x] 2.1 Create manifest.json with app metadata:
  - name: "APIS Dashboard"
  - short_name: "APIS"
  - theme_color: "#f7a42d" (seaBuckthorn from theme)
  - background_color: "#fbf9e7" (coconutCream from theme)
  - display: "standalone"
  - start_url: "/"
  - scope: "/"
- [x] 2.2 Create PWA icons (192x192, 512x512, maskable) in public/icons/ (SVG format)
- [x] 2.3 Create apple-touch-icon for iOS home screen (SVG format)
- [x] 2.4 Update index.html with manifest link and meta tags:
  - Manifest injected by vite-plugin-pwa
  - `<meta name="theme-color" content="#f7a42d">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
  - `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.svg">`

### Task 3: Service Worker Registration (AC: #1, #3, #4)
- [x] 3.1 Create src/registerSW.ts for service worker registration
- [x] 3.2 Implement registration with error handling and logging
- [x] 3.3 Implement update detection callback
- [x] 3.4 Export hook for update notification state (useSWUpdate.ts)
- [x] 3.5 Integrate registration in main.tsx (via useSWUpdate hook in App.tsx)

### Task 4: Offline Status Detection (AC: #1)
- [x] 4.1 Create src/hooks/useOnlineStatus.ts hook
- [x] 4.2 Listen to navigator.onLine and online/offline events
- [x] 4.3 Export isOnline state and any pending sync count (placeholder for 7-4)

### Task 5: Offline Banner Component (AC: #1)
- [x] 5.1 Create src/components/OfflineBanner.tsx component
- [x] 5.2 Display fixed banner when offline: "Offline mode - some features unavailable"
- [x] 5.3 Style with APIS theme (warning color, amber tones, honeycomb pattern)
- [x] 5.4 Add to AppLayout.tsx above Content area
- [x] 5.5 Banner auto-hides when connection restored
- [x] 5.6 **Dependency:** Uses usePendingSync from Story 7.3 for pending count display (forward dependency documented)

### Task 6: Update Notification Component (AC: #3)
- [x] 6.1 Create src/components/UpdateNotification.tsx component
- [x] 6.2 Display notification when new version available
- [x] 6.3 Include "Refresh" button to apply update
- [x] 6.4 Style as dismissible notification (custom toast with honeycomb accents)
- [x] 6.5 Integrate into App.tsx

### Task 7: Public Assets & Icons (AC: #2)
- [x] 7.1 Create apis-dashboard/public/ directory if not exists
- [x] 7.2 Create public/icons/ directory
- [x] 7.3 Generate icon-192x192.svg (APIS logo/bee icon with shield) **Note: SVG format used for better scalability**
- [x] 7.4 Generate icon-512x512.svg **Note: SVG format used instead of PNG per Completion Notes**
- [x] 7.5 Generate icon-maskable-512x512.svg (with safe zone padding) **Note: SVG format**
- [x] 7.6 Generate apple-touch-icon.svg (180x180 with rounded corners) **Note: SVG format**
- [x] 7.7 Keep existing favicon.svg with APIS branding

### Task 8: Integration & Testing (AC: #1, #2, #3, #4)
- [x] 8.1 Verify build completes without errors
- [x] 8.2 Test offline mode in Chrome DevTools (Application > Service Workers)
- [x] 8.3 Test PWA install prompt appears on supported browsers
- [x] 8.4 Test update notification by modifying and rebuilding
- [x] 8.5 Update component exports in components/index.ts
- [x] 8.6 Update hook exports in hooks/index.ts

## Dev Notes

### Architecture Patterns (from architecture.md)

**PWA Architecture (from architecture.md:806-822):**
```
┌─────────────────────────────────────────────┐
│              Browser (PWA)                   │
├─────────────────────────────────────────────┤
│  Service Worker                              │
│  ├── App shell caching (HTML, JS, CSS)       │
│  ├── API response caching                    │
│  └── Background sync queue                   │
│                                              │
│  IndexedDB (via Dexie.js)                    │
│  ├── inspections (offline drafts)            │
│  ├── photos (pending upload)                 │
│  ├── syncQueue (pending API calls)           │
│  └── cachedData (hives, units, etc.)         │
└─────────────────────────────────────────────┘
```

**This story focuses on the Service Worker layer only.** IndexedDB storage (Dexie.js) is covered in Story 7.2.

**File Structure (from architecture.md:1393-1398):**
```
├── public/
│   ├── sw.js                # Service Worker (generated by vite-plugin-pwa)
│   └── manifest.json        # PWA manifest
```

### Technology Stack

**Workbox via vite-plugin-pwa:**
- vite-plugin-pwa handles Service Worker generation automatically
- Uses Workbox under the hood for caching strategies
- workbox-window provides client-side API for SW communication

**Why vite-plugin-pwa:**
1. Zero-config for Vite projects
2. Automatic precache manifest generation from build output
3. TypeScript support for registerSW
4. HMR-friendly (doesn't interfere with dev mode)
5. Built-in update prompt support

### Vite PWA Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // Shows update notification instead of auto-update
      includeAssets: ['favicon.ico', 'icons/*.png'],
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
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Precache all built assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Runtime caching for API
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\/.*/i,
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
  // ... rest of config
})
```

### Service Worker Registration

```typescript
// src/registerSW.ts
import { registerSW } from 'virtual:pwa-register'

export interface SWUpdateState {
  needRefresh: boolean
  offlineReady: boolean
}

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined

export function initServiceWorker(
  onUpdate: (state: SWUpdateState) => void,
  onError: (error: Error) => void
) {
  updateSW = registerSW({
    onNeedRefresh() {
      onUpdate({ needRefresh: true, offlineReady: false })
    },
    onOfflineReady() {
      onUpdate({ needRefresh: false, offlineReady: true })
    },
    onRegistered(registration) {
      console.log('Service Worker registered:', registration)
    },
    onRegisterError(error) {
      console.error('Service Worker registration error:', error)
      onError(error)
    },
  })
}

export function applyUpdate() {
  if (updateSW) {
    updateSW(true) // true = reload page after update
  }
}
```

### Online Status Hook

```typescript
// src/hooks/useOnlineStatus.ts
import { useState, useEffect, useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true; // SSR assumes online
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

### Theme Colors Reference

From `theme/apisTheme.ts`:
```typescript
// Primary theme color for PWA
seaBuckthorn: '#f7a42d'  // theme_color in manifest

// Background color for PWA splash
coconutCream: '#fbf9e7'  // background_color in manifest

// Warning color for offline banner
warning: '#e67e00'       // amber warning tone
```

### Component Patterns

**OfflineBanner.tsx:**
```tsx
import { Alert } from 'antd';
import { WifiOutlined } from '@ant-design/icons';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { colors } from '../theme/apisTheme';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <Alert
      message="Offline mode - some features unavailable"
      type="warning"
      icon={<WifiOutlined />}
      showIcon
      banner
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
      }}
    />
  );
}
```

**UpdateNotification.tsx:**
```tsx
import { useEffect } from 'react';
import { notification, Button } from 'antd';
import { applyUpdate } from '../registerSW';

export function useUpdateNotification(needRefresh: boolean) {
  useEffect(() => {
    if (needRefresh) {
      notification.info({
        key: 'sw-update',
        message: 'New version available',
        description: 'A new version of APIS is available. Click to update.',
        duration: 0, // Don't auto-close
        btn: (
          <Button type="primary" onClick={() => {
            notification.destroy('sw-update');
            applyUpdate();
          }}>
            Refresh
          </Button>
        ),
      });
    }
  }, [needRefresh]);
}
```

### Icon Generation

For the PWA icons, you have several options:

1. **Use a tool like realfavicongenerator.net** - Upload a source image (512x512 minimum) and it generates all sizes
2. **Use sharp/imagemagick CLI** - `npx sharp-cli resize 512 512 < source.png > icon-512.png`
3. **Create SVG and convert** - Scalable source that converts cleanly

**Recommended source icon:**
- Bee/honeycomb themed
- Works at small sizes (clear at 48x48)
- Matches brand colors (seaBuckthorn gold, brownBramble dark)

**Maskable icon requirements:**
- Safe zone: center 80% of image
- Background should extend to edges
- Icon content centered in safe zone

### Dependencies to Install

```bash
cd apis-dashboard
npm install -D vite-plugin-pwa
npm install workbox-window
```

**Package versions (latest stable):**
- vite-plugin-pwa: ^0.17.x or later
- workbox-window: ^7.x

### TypeScript Configuration

Add vite-plugin-pwa types to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "types": ["vite-plugin-pwa/client"]
  }
}
```

Or create `src/vite-pwa.d.ts`:
```typescript
/// <reference types="vite-plugin-pwa/client" />
```

### Project Structure Changes

**Files to create:**
- `apis-dashboard/src/registerSW.ts`
- `apis-dashboard/src/hooks/useOnlineStatus.ts`
- `apis-dashboard/src/components/OfflineBanner.tsx`
- `apis-dashboard/src/components/UpdateNotification.tsx`
- `apis-dashboard/public/icons/icon-192x192.png`
- `apis-dashboard/public/icons/icon-512x512.png`
- `apis-dashboard/public/icons/icon-maskable-512x512.png`
- `apis-dashboard/public/icons/apple-touch-icon.png`

**Files to modify:**
- `apis-dashboard/vite.config.ts` - Add VitePWA plugin
- `apis-dashboard/package.json` - Dependencies already added in Task 1
- `apis-dashboard/index.html` - Add manifest link and meta tags
- `apis-dashboard/src/main.tsx` - Initialize service worker
- `apis-dashboard/src/App.tsx` or `AppLayout.tsx` - Add OfflineBanner
- `apis-dashboard/src/components/index.ts` - Export new components
- `apis-dashboard/src/hooks/index.ts` - Export new hook
- `apis-dashboard/tsconfig.json` - Add PWA types

### Testing Strategy

**Manual Testing Checklist:**
1. `npm run build` completes without errors
2. `npm run preview` serves the built app
3. Chrome DevTools > Application > Service Workers shows registered SW
4. Network tab shows requests served from SW cache after first load
5. Toggle "Offline" in DevTools > Network - app still loads
6. Offline banner appears when offline
7. PWA install prompt appears (desktop Chrome, mobile browsers)
8. Modify a file, rebuild, see update notification in preview

**Lighthouse PWA Audit:**
Run Lighthouse in Chrome DevTools on the production build to verify:
- Installable
- PWA optimized
- Service worker registered
- Manifest valid

### Caching Strategy Rationale

| Resource Type | Strategy | Reason |
|---------------|----------|--------|
| App shell (HTML/JS/CSS) | Precache | Always available offline |
| Static assets (fonts, icons) | Precache | Never changes between versions |
| API GET requests | Stale-while-revalidate | Show cached data instantly, update in background |
| API POST/PUT/DELETE | Network-only | Mutations need sync queue (Story 7.4) |

**Note:** API caching in this story is basic (24-hour expiry). Story 7.2 adds IndexedDB for persistent offline data, and Story 7.4 adds background sync for offline mutations.

### References

- [Source: architecture.md#PWA-Architecture] - PWA architecture diagram
- [Source: architecture.md#File-Structure] - File locations for SW and manifest
- [Source: epics.md#Story-7.1] - Full acceptance criteria
- [Source: theme/apisTheme.ts] - Color values for manifest
- [Vite PWA Plugin docs](https://vite-pwa-org.netlify.app/) - Configuration reference
- [Workbox docs](https://developers.google.com/web/tools/workbox) - Caching strategies

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

1. **Dependencies already installed**: vite-plugin-pwa (v1.2.0) and workbox-window (v7.4.0) were already in package.json
2. **SVG icons used instead of PNG**: Used scalable SVG format for all PWA icons for better quality at all sizes
3. **Build size configuration**: Added `maximumFileSizeToCacheInBytes: 4MB` to workbox config to accommodate the large app bundle (3.6MB)
4. **VitePWA registerType**: Set to 'prompt' to show update notification instead of auto-updating
5. **Honeycomb design elements**: Both OfflineBanner and UpdateNotification use honeycomb patterns matching APIS theme
6. **useSWUpdate hook created**: Provides centralized SW state management with automatic initialization
7. **Test mock for virtual import**: Created `tests/__mocks__/virtual-pwa-register.ts` and configured vitest alias to handle the virtual:pwa-register import during testing
8. **All 78 tests pass**: Including 11 new tests for useOnlineStatus (5) and OfflineBanner (6)

### File List

**New Files Created:**
- `apis-dashboard/src/registerSW.ts` - Service worker registration module
- `apis-dashboard/src/hooks/useOnlineStatus.ts` - Online/offline status hook
- `apis-dashboard/src/hooks/useSWUpdate.ts` - Service worker update state hook
- `apis-dashboard/src/components/OfflineBanner.tsx` - Offline status banner component
- `apis-dashboard/src/components/UpdateNotification.tsx` - Update notification toast component
- `apis-dashboard/src/vite-pwa.d.ts` - TypeScript types for vite-plugin-pwa
- `apis-dashboard/public/icons/icon-192x192.svg` - PWA icon 192x192
- `apis-dashboard/public/icons/icon-512x512.svg` - PWA icon 512x512
- `apis-dashboard/public/icons/icon-maskable-512x512.svg` - Maskable PWA icon
- `apis-dashboard/public/icons/apple-touch-icon.svg` - iOS home screen icon
- `apis-dashboard/tests/hooks/useOnlineStatus.test.ts` - useOnlineStatus hook tests
- `apis-dashboard/tests/components/OfflineBanner.test.tsx` - OfflineBanner component tests
- `apis-dashboard/tests/__mocks__/virtual-pwa-register.ts` - Mock for vite-plugin-pwa virtual import

**Modified Files:**
- `apis-dashboard/vite.config.ts` - Added VitePWA plugin configuration
- `apis-dashboard/package.json` - Dependencies already present
- `apis-dashboard/index.html` - Added PWA meta tags
- `apis-dashboard/src/App.tsx` - Integrated UpdateNotification component
- `apis-dashboard/src/components/layout/AppLayout.tsx` - Integrated OfflineBanner component
- `apis-dashboard/src/components/index.ts` - Exported new components
- `apis-dashboard/src/hooks/index.ts` - Exported new hooks
- `apis-dashboard/vitest.config.ts` - Added virtual:pwa-register alias for tests and testTimeout configuration
- `apis-dashboard/tests/setup.ts` - Unchanged (mock handled via alias)
- `apis-dashboard/tests/hooks/useSWUpdate.test.ts` - Tests for useSWUpdate hook (added post-review)
- `apis-dashboard/tests/components/UpdateNotification.test.tsx` - Tests for UpdateNotification component (added post-review)
