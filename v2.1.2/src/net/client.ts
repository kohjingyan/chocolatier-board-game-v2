import PartySocket from 'partysocket'
import type { Action } from '../engine/types'
import type { ClientMessage, RoomSnapshot, ServerMessage } from './protocol'
import { ROOM_CODE_RE, randomRoomCode } from './protocol'

const CLIENT_KEY = 'chocolatier-client-id'

export function partyHost(): string {
  const fromEnv = (import.meta.env.VITE_PARTYKIT_HOST as string | undefined)?.trim()
  if (fromEnv) return fromEnv
  if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    return '127.0.0.1:1999'
  }
  return ''
}

export function isPartyKitHost(host: string): boolean {
  return host.includes('partykit.dev') || host.includes('partykit.com') || host.includes('workers.dev')
}

export function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_KEY)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `c-${Date.now().toString(36)}`
    localStorage.setItem(CLIENT_KEY, id)
    return id
  } catch {
    return `c-${Date.now().toString(36)}`
  }
}

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6)
}

export function isRoomCode(raw: string): boolean {
  return ROOM_CODE_RE.test(normalizeRoomCode(raw))
}

export function createRoomCode(): string {
  return randomRoomCode()
}

export function roomUrl(code: string): string {
  const origin = typeof location !== 'undefined' ? location.origin : ''
  return `${origin}/?room=${code}`
}

type SocketLike = {
  send: (data: string) => void
  close: () => void
  addEventListener: (type: string, fn: (ev: MessageEvent | Event) => void) => void
  removeEventListener: (type: string, fn: (ev: MessageEvent | Event) => void) => void
}

function socketReady(socket: SocketLike): boolean {
  return 'readyState' in socket && (socket as { readyState?: number }).readyState === 1
}

function openSocket(host: string, room: string): SocketLike {
  if (isPartyKitHost(host)) {
    return new PartySocket({ host, room, party: 'room' }) as unknown as SocketLike
  }
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'ws' : 'wss'
  const clean = host.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '')
  return new WebSocket(`${proto}://${clean}/room/${room}`)
}

export function connectRoom(
  code: string,
  onSnapshot: (room: RoomSnapshot, you: string) => void,
  onError: (message: string) => void,
): { send: (msg: ClientMessage) => void; dispose: () => void } {
  const host = partyHost()
  const room = normalizeRoomCode(code)
  const socket = openSocket(host, room)
  let opened = socketReady(socket)
  const queue: ClientMessage[] = []
  const send = (msg: ClientMessage) => {
    const raw = JSON.stringify(msg)
    if (opened) socket.send(raw)
    else queue.push(msg)
  }
  const onOpen = () => {
    opened = true
    send({ type: 'hello', clientId: getClientId() })
    for (const msg of queue.splice(0, queue.length)) socket.send(JSON.stringify(msg))
  }
  if (opened) onOpen()
  const onMessage = (ev: MessageEvent | Event) => {
    const data = 'data' in ev ? String((ev as MessageEvent).data) : ''
    if (!data) return
    try {
      const msg = JSON.parse(data) as ServerMessage
      if (msg.type === 'snapshot') onSnapshot(msg.room, msg.you)
      if (msg.type === 'error') onError(msg.message)
    } catch {
      onError('Lost a room message.')
    }
  }
  socket.addEventListener('open', onOpen)
  socket.addEventListener('message', onMessage)
  return {
    send,
    dispose: () => {
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('message', onMessage)
      socket.close()
    },
  }
}

export function sendAction(send: (msg: ClientMessage) => void, action: Action) {
  send({ type: 'action', action })
}
