import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pakket from './package.json'

export default defineConfig({
  plugins: [react()],
  // Versienummer uit package.json, getoond onderin de zijbalk.
  define: {
    __APP_VERSIE__: JSON.stringify(pakket.version),
  },
  server: {
    port: 5173,
  },
})
