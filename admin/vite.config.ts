import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Separate site from the mobile app so admin code never ships in the App Store build.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: '../dist-admin', emptyOutDir: true, sourcemap: false },
})
