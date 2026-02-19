import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    __DEV_MODE__: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000, // 15 seconds - accommodates slower tests (e.g., useWeather, useDetectionStats)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Mock vite-plugin-pwa virtual module for tests
      'virtual:pwa-register': resolve(__dirname, './tests/__mocks__/virtual-pwa-register.ts'),
      // Mock heavy dependencies that crash or hang in jsdom.
      // Using resolve aliases instead of vi.mock Proxy (which causes vitest hangs).
      'qrcode': resolve(__dirname, './tests/__mocks__/qrcode.ts'),
      '@ant-design/icons': resolve(__dirname, './tests/__mocks__/ant-design-icons.ts'),
      '@ant-design/charts': resolve(__dirname, './tests/__mocks__/ant-design-charts.ts'),
      'react-leaflet': resolve(__dirname, './tests/__mocks__/react-leaflet.ts'),
      // Leaflet subpath aliases must come before the main leaflet alias
      // to prevent leaflet/dist/* from being rewritten to <mock>/dist/*
      'leaflet/dist/leaflet.css': resolve(__dirname, './tests/__mocks__/leaflet-css.ts'),
      'leaflet/dist/images/marker-shadow.png': resolve(__dirname, './tests/__mocks__/leaflet-marker-shadow.ts'),
      'leaflet': resolve(__dirname, './tests/__mocks__/leaflet.ts'),
      'html5-qrcode': resolve(__dirname, './tests/__mocks__/html5-qrcode.ts'),
    },
  },
});
