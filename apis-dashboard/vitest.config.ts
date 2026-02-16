import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000, // 10 seconds - accommodates slower tests (e.g., useWeather, useDetectionStats)
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
    },
  },
});
