import { useCallback, useEffect, useRef, useState } from 'react'

// Weegschaal op de seriële poort van deze pc, via Web Serial (Chrome en Edge).
// Zelfde instellingen als frmVerpakkenDoos in Controlsys: 19200 baud, 8N1.
const INSTELLING = { baudRate: 19200, dataBits: 8, stopBits: 1, parity: 'none' }
const NIET_TE_OPENEN = 'De weegschaal is niet te openen. Is Controlsys nog open op deze pc?'

export const weegschaalOndersteund = typeof navigator !== 'undefined' && 'serial' in navigator

// Een meting is een regel van precies 15 tekens, met op plek 4 t/m 10 het
// gewicht. Controlsys las dat met Nederlandse notatie: een punt telt niet mee
// en de uitkomst is in gram. Geeft kilo's, of null als het geen meting is.
export function leesGewicht(regel) {
  if (regel.length !== 15) return null
  const tekst = regel.slice(3, 10).replace(/[\s.]/g, '')
  if (!/^[+-]?\d+$/.test(tekst)) return null
  return Number(tekst) / 1000
}

// `gewicht` is de laatste meting in kg, of null zonder weegschaal.
export function useWeegschaal() {
  const [gewicht, setGewicht] = useState(null)
  const [verbonden, setVerbonden] = useState(false)
  const [fout, setFout] = useState(null)
  const actief = useRef(null)

  const verbreek = useCallback(async () => {
    const sessie = actief.current
    if (!sessie) return
    sessie.stop = true
    await sessie.reader?.cancel().catch(() => {})
  }, [])

  const lees = useCallback(async (sessie) => {
    const { port } = sessie
    const decoder = new TextDecoder('ascii')
    let buffer = ''
    try {
      while (port.readable && !sessie.stop) {
        sessie.reader = port.readable.getReader()
        try {
          for (;;) {
            const { value, done } = await sessie.reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const regels = buffer.split('\r\n')
            buffer = regels.pop().slice(-200)
            for (const regel of regels) {
              const kg = leesGewicht(regel)
              if (kg !== null && !sessie.stop) setGewicht(kg)
            }
          }
        } catch (e) {
          // Een storing op de lijn sluit de poort niet; pas bij het lostrekken
          // van de kabel is port.readable leeg en stopt de lus.
          if (!port.readable) throw e
        } finally {
          sessie.reader.releaseLock()
        }
      }
    } catch {
      setFout('De verbinding met de weegschaal is verbroken.')
    } finally {
      await port.close().catch(() => {})
      if (actief.current === sessie) actief.current = null
      setVerbonden(false)
      setGewicht(null)
    }
  }, [])

  const open = useCallback(
    async (port) => {
      if (actief.current) return
      const sessie = { port, stop: false, reader: null }
      actief.current = sessie
      try {
        await port.open(INSTELLING)
      } catch (e) {
        actief.current = null
        throw e
      }
      setFout(null)
      setVerbonden(true)
      lees(sessie)
    },
    [lees]
  )

  // Eerder gekozen poort meteen weer openen, zoals Controlsys bij het laden.
  useEffect(() => {
    if (!weegschaalOndersteund) return undefined
    let weg = false
    navigator.serial
      .getPorts()
      .then((ports) => (!weg && ports.length === 1 ? open(ports[0]) : null))
      .catch(() => {
        if (!weg) setFout(NIET_TE_OPENEN)
      })
    return () => {
      weg = true
      verbreek()
    }
  }, [open, verbreek])

  async function verbind() {
    setFout(null)
    try {
      await open(await navigator.serial.requestPort())
    } catch (e) {
      if (e.name !== 'NotFoundError') setFout(NIET_TE_OPENEN) // NotFoundError: geen poort gekozen
    }
  }

  return { gewicht, verbonden, fout, verbind, verbreek }
}
