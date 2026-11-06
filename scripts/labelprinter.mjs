// Lokale hulp op de pc met de labelprinter. De browser mag zelf geen printer
// kiezen, dus dit programmaatje stuurt het label naar de printer die in FMID
// is ingesteld (niet de standaardprinter van Windows).
//
// Start: npm run labelprinter
// Luistert alleen op deze pc: http://127.0.0.1:8791

import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const POORT = 8791
const HOST = '127.0.0.1'

function instellingPad() {
  const basis = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Local')
  return join(basis, 'FMID', 'labelprinter.json')
}

async function leesInstelling() {
  try {
    const data = JSON.parse(await readFile(instellingPad(), 'utf8'))
    return String(data.printer || '').trim()
  } catch {
    return ''
  }
}

async function schrijfInstelling(printer) {
  const pad = instellingPad()
  await mkdir(join(pad, '..'), { recursive: true })
  await writeFile(pad, JSON.stringify({ printer }, null, 2), 'utf8')
}

function powershell(script, env) {
  return new Promise((resolve, reject) => {
    const kind = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env: { ...process.env, ...env }, windowsHide: true }
    )
    let uit = ''
    let fout = ''
    kind.stdout.on('data', (b) => {
      uit += b
    })
    kind.stderr.on('data', (b) => {
      fout += b
    })
    kind.on('error', reject)
    kind.on('close', (code) => {
      if (code === 0) resolve(uit.trim())
      else reject(new Error(fout.trim() || uit.trim() || `PowerShell stopte met code ${code}`))
    })
  })
}

async function printers() {
  const uit = await powershell(
    "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"
  )
  if (!uit) return []
  const data = JSON.parse(uit)
  return (Array.isArray(data) ? data : [data]).filter(Boolean)
}

async function drukAf({ printer, copies, pngBase64, widthMm, heightMm }) {
  const gekozen = String(printer || '').trim() || (await leesInstelling())
  if (!gekozen) throw new Error('Geen printer vastgezet op deze pc')
  printer = gekozen
  const n = Math.min(500, Math.max(1, Number(copies) || 1))
  const breed = Math.round((Number(widthMm) || 96) / 25.4 * 100)
  const hoog = Math.round((Number(heightMm) || 98) / 25.4 * 100)
  const map = await mkdtemp(join(tmpdir(), 'fmid-label-'))
  const bestand = join(map, 'label.png')
  try {
    await writeFile(bestand, Buffer.from(pngBase64, 'base64'))
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$global:FMID_IMG = [System.Drawing.Image]::FromFile($env:FMID_LABEL)
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = $env:FMID_PRINTER
if (-not $pd.PrinterSettings.IsValid) { throw "Printer niet gevonden: $($env:FMID_PRINTER)" }
$pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
$pd.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('FMID label', [int]$env:FMID_W, [int]$env:FMID_H)
$pd.add_PrintPage({
  param($sender, $e)
  $rechthoek = New-Object System.Drawing.Rectangle(0, 0, $e.PageBounds.Width, $e.PageBounds.Height)
  $e.Graphics.DrawImage($global:FMID_IMG, $rechthoek)
  $e.HasMorePages = $false
})
for ($i = 0; $i -lt [int]$env:FMID_KOPIEEN; $i++) { $pd.Print() }
$global:FMID_IMG.Dispose()
$pd.Dispose()
`
    await powershell(script, {
      FMID_LABEL: bestand,
      FMID_PRINTER: printer,
      FMID_KOPIEEN: String(n),
      FMID_W: String(breed),
      FMID_H: String(hoog),
    })
  } finally {
    await rm(map, { recursive: true, force: true })
  }
}

function stuur(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(json)
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    stuur(res, 204, {})
    return
  }
  try {
    if (req.method === 'GET' && req.url.startsWith('/printers')) {
      stuur(res, 200, { printers: await printers(), printer: await leesInstelling() })
      return
    }
    if (req.method === 'POST' && req.url.startsWith('/instelling')) {
      const stukken = []
      for await (const stuk of req) stukken.push(stuk)
      const body = JSON.parse(Buffer.concat(stukken).toString('utf8') || '{}')
      const naam = String(body.printer || '').trim()
      if (!naam) throw new Error('Kies een printer')
      const lijst = await printers()
      if (!lijst.includes(naam)) throw new Error(`Printer niet gevonden op deze pc: ${naam}`)
      await schrijfInstelling(naam)
      stuur(res, 200, { printer: naam })
      return
    }
    if (req.method === 'POST' && req.url.startsWith('/print')) {
      const stukken = []
      for await (const stuk of req) stukken.push(stuk)
      const body = JSON.parse(Buffer.concat(stukken).toString('utf8') || '{}')
      await drukAf(body)
      stuur(res, 200, { ok: true })
      return
    }
    stuur(res, 404, { fout: 'Niet gevonden' })
  } catch (e) {
    stuur(res, 500, { fout: e.message || 'Afdrukken mislukt' })
  }
})

server.listen(POORT, HOST, () => {
  console.log(`Labelprinter luistert op http://${HOST}:${POORT}`)
})
