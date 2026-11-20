import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './', // Use relative paths for Electron production builds
  plugins: [
    react()
  ],
  assetsInclude: ['**/*.sql'], // Include SQL files as assets
  build: {
    assetsInlineLimit: 0, // Don't inline SQL files
    rollupOptions: {
      output: {
        manualChunks(id) {
          const modulePath = id.replace(/\\/g, '/')
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(modulePath)) {
            return 'react_vendor'
          }
        },
      },
    },
  },
  server: {
    port: 5175,
    strictPort: false,
  }
})
