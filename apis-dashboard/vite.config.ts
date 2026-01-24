import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0', // Allow access from Docker
    watch: {
      usePolling: true, // Required for Docker volume mounts HMR
    },
  },
})
