import net from 'net'
import tls from 'tls'

// Eén poort voor de telefoon. Zonder https krijgt Chrome "geen gegevens
// verzonden" als de server alleen tls spreekt. Met https mag de camera aan.
let huidig

export function startTelefoonPoort({ key, cert, poort = 5173, doel = 5174 }) {
  const vorige = huidig
  const starten = () => {
    luister({ key, cert, poort, doel })
  }
  if (!vorige) {
    starten()
    return
  }
  vorige.tlsServer.close()
  vorige.server.close(() => starten())
}

function luister({ key, cert, poort, doel }) {
  const tlsServer = tls.createServer({ key, cert }, (klaar) => {
    const boven = net.connect(doel, '127.0.0.1')
    klaar.pipe(boven)
    boven.pipe(klaar)
    klaar.on('error', () => boven.destroy())
    boven.on('error', () => klaar.destroy())
    klaar.on('close', () => boven.destroy())
    boven.on('close', () => klaar.destroy())
  })

  const server = net.createServer((socket) => {
    socket.once('data', (buf) => {
      const isTls = buf[0] === 0x16
      if (isTls) {
        socket.pause()
        socket.unshift(buf)
        tlsServer.emit('connection', socket)
        return
      }
      const boven = net.connect(doel, '127.0.0.1', () => {
        boven.write(buf)
        socket.pipe(boven)
        boven.pipe(socket)
      })
      socket.on('error', () => boven.destroy())
      boven.on('error', () => socket.destroy())
      socket.on('close', () => boven.destroy())
      boven.on('close', () => socket.destroy())
    })
    socket.on('error', () => {})
  })

  server.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') throw err
  })
  server.listen(poort, '0.0.0.0')
  huidig = { server, tlsServer }
}
