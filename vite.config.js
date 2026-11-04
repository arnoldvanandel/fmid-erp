import os from 'os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pakket from './package.json'

// Wifi-adres van deze pc, zodat een telefoon de QR kan openen (niet localhost).
function lokaalAdres() {
  const ips = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      const v4 = net.family === 'IPv4' || net.family === 4
      if (v4 && !net.internal) ips.push(net.address)
    }
  }
  return (
    ips.find((ip) => ip.startsWith('192.168.')) ||
    ips.find((ip) => ip.startsWith('10.')) ||
    ips.find((ip) => !ip.startsWith('172.')) ||
    ips[0] ||
    ''
  )
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'netwerk-adres',
      configureServer(server) {
        server.middlewares.use('/netwerk-adres', (_req, res) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ host: lokaalAdres() }))
        })
      },
    },
  ],
  // Versienummer uit package.json, getoond onderin de zijbalk.
  define: {
    __APP_VERSIE__: JSON.stringify(pakket.version),
  },
  server: {
    port: 5173,
    host: true,
  },
})
