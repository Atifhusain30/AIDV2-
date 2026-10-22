import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // F6: library code in its own long-lived files (an app update that only changes AID code
        // doesn't re-download them). "maps" (Leaflet) and "stripe" are reached only from lazy-loaded
        // screens, so they download when first needed. React, framer-motion and Supabase are all
        // needed for the first screen, so they share one "vendor" file: measured at Fast 3G, a
        // separate Supabase file cost an extra round trip (~0.3 s slower to the first screen).
        manualChunks(id) {
          // Leaflet's stylesheet stays in the main CSS (imported in main.tsx, before rebrand.css,
          // whose map overrides depend on coming after it); only Leaflet's JS goes to "maps".
          if (!id.includes('node_modules') || /\.css($|\?)/.test(id)) return undefined
          if (/node_modules\/(react|react-dom|scheduler|framer-motion|@supabase)\//.test(id)) return 'vendor'
          if (/node_modules\/(leaflet|react-leaflet|@react-leaflet)\//.test(id)) return 'maps'
          if (/node_modules\/@stripe\//.test(id)) return 'stripe'
          return undefined
        }
      }
    }
  },
  test: {
    setupFiles: ['src/test/setup.ts'],
    exclude: ['server/**', 'node_modules/**', 'dist/**', 'ios/**'],
  }
})
