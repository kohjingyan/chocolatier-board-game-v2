import { createServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { ROOM_CODE_RE } from '../src/net/protocol'
import { RoomLogic } from '../src/net/roomLogic'

const port = Number(process.env.PARTY_PORT ?? 1999)
const rooms = new Map<string, { logic: RoomLogic; sockets: Map<string, WebSocket> }>()
let seq = 0

function roomFromUrl(url: string | undefined): string | null {
  if (!url) return null
  const path = url.split('?')[0] ?? ''
  const parts = path.split('/').filter(Boolean)
  const code = (parts[parts.length - 1] ?? '').toUpperCase()
  return ROOM_CODE_RE.test(code) ? code : null
}

function getRoom(code: string) {
  let entry = rooms.get(code)
  if (!entry) {
    const sockets = new Map<string, WebSocket>()
    const logic = new RoomLogic(
      (connId, msg) => {
        const ws = sockets.get(connId)
        if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
      },
      () => [...sockets.keys()],
    )
    entry = { logic, sockets }
    rooms.set(code, entry)
  }
  return entry
}

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('Chocolatier rooms')
})

const wss = new WebSocketServer({ server })
wss.on('connection', (ws, req) => {
  const code = roomFromUrl(req.url)
  if (!code) {
    ws.close()
    return
  }
  const room = getRoom(code)
  seq += 1
  const id = `c${seq}`
  room.sockets.set(id, ws)
  room.logic.onConnect(id)
  ws.on('message', (data) => room.logic.onMessage(id, String(data)))
  ws.on('close', () => {
    room.logic.onClose(id)
    room.sockets.delete(id)
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Chocolatier rooms on ws://127.0.0.1:${port}`)
})
