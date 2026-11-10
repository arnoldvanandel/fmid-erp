import fs from 'fs'
import os from 'os'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import selfsigned from 'selfsigned'
import pakket from './package.json'
import { startTelefoonPoort } from './scripts/telefoonPoort.js'

// Alleen tekeningmappen van Axapta. Geen willekeurig pad op de schijf.
function tekeningToegestaan(pad) {
  const norm = path.win32.normalize(String(pad || '').trim())
  if (!norm || norm.includes('\0')) return ''
  const boven = norm.toUpperCase()
  const lokaal = /^[A-Z]:\\(DRAWING|TEKENINGEN)\\/.test(boven)
  const netwerk = boven.startsWith('\\\\') && (boven.includes('\\DRAWING\\') || boven.includes('\\TEKENINGEN\\'))
  return lokaal || netwerk ? norm : ''
}

function tekeningType(bestand) {
  const ext = path.win32.extname(bestand).toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.tif' || ext === '.tiff') return 'image/tiff'
  return 'application/octet-stream'
}

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

// Certificaat met het wifi-adres als IP. Een naam-certificaat wijst de telefoon af.
async function httpsOpties() {
  const ip = lokaalAdres()
  const map = path.join(process.cwd(), 'node_modules', '.vite', 'fmid-ssl')
  const sleutelPad = path.join(map, 'key.pem')
  const certPad = path.join(map, 'cert.pem')
  const stempelPad = path.join(map, 'adres.txt')
  const merk = `${ip}|blad`
  const stempel = fs.existsSync(stempelPad) ? fs.readFileSync(stempelPad, 'utf8').trim() : ''
  if (!fs.existsSync(certPad) || !fs.existsSync(sleutelPad) || stempel !== merk) {
    fs.mkdirSync(map, { recursive: true })
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
    ]
    if (ip) altNames.push({ type: 7, ip })
    const pem = await selfsigned.generate([{ name: 'commonName', value: 'fmid-lokaal' }], {
      algorithm: 'sha256',
      keySize: 2048,
      extensions: [
        { name: 'basicConstraints', cA: false },
        {
          name: 'keyUsage',
          digitalSignature: true,
          keyEncipherment: true,
        },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames },
      ],
    })
    fs.writeFileSync(sleutelPad, pem.private)
    fs.writeFileSync(certPad, pem.cert)
    fs.writeFileSync(stempelPad, merk)
  }
  return {
    key: fs.readFileSync(sleutelPad),
    cert: fs.readFileSync(certPad),
  }
}

export default defineConfig(async () => ({
  plugins: [
    react(),
    {
      name: 'netwerk-adres',
      async configureServer(server) {
        const https = await httpsOpties()
        startTelefoonPoort({ key: https.key, cert: https.cert })
        server.middlewares.use('/netwerk-adres', (_req, res) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ host: lokaalAdres() }))
        })
        // H:\Drawing\Axapta\….pdf in een nieuw tabblad. De browser weigert
        // een file:-link vanaf de site, dus de dev-server leest het bestand.
        server.middlewares.use('/axapta-tekening', (req, res) => {
          const zoek = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
          const bestand = tekeningToegestaan(new URLSearchParams(zoek).get('pad'))
          if (!bestand) {
            res.statusCode = 403
            res.end('Dit pad is geen tekening.')
            return
          }
          fs.stat(bestand, (err, stat) => {
            if (err || !stat.isFile()) {
              res.statusCode = 404
              res.end('Tekening niet gevonden.')
              return
            }
            const naam = path.win32.basename(bestand).replace(/[\r\n"]/g, '')
            res.setHeader('Content-Type', tekeningType(bestand))
            res.setHeader('Content-Length', stat.size)
            res.setHeader('Content-Disposition', `inline; filename="${naam}"`)
            fs.createReadStream(bestand).pipe(res)
          })
        })
      },
    },
  ],
  // Versienummer uit package.json, getoond onderin de zijbalk.
  define: {
    __APP_VERSIE__: JSON.stringify(pakket.version),
  },
  server: {
    // Alleen op deze pc. De telefoon komt binnen via scripts/telefoonPoort.js op 5173.
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    hmr: { clientPort: 5173 },
  },
}))
