import type { Action, GameState } from '../engine/types'

export const ROOM_CODE_RE = /^[A-Z2-9]{6}$/

export type Seat = {
  id: string
  name: string
  isBot: boolean
  claimedBy: string | null
}

export type RoomSnapshot = {
  hostId: string
  seats: Seat[]
  game: GameState | null
}

export type PersistedRoom = {
  hostId: string
  seats: Seat[]
  game: GameState | null
}

export type ClientMessage =
  | { type: 'hello'; clientId: string; name?: string }
  | { type: 'claimSeat'; seatId: string; name: string }
  | { type: 'releaseSeat'; seatId: string }
  | { type: 'setSeat'; seatId: string; name: string; isBot: boolean }
  | { type: 'setCount'; count: number }
  | { type: 'start' }
  | { type: 'action'; action: Action }
  | { type: 'newGame' }

export type ServerMessage =
  | { type: 'snapshot'; room: RoomSnapshot; you: string }
  | { type: 'error'; message: string }

export function randomRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  for (let i = 0; i < 6; i += 1) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export function sanitizeName(raw: string): string {
  return raw.replace(/[<>]/g, '').slice(0, 24)
}

export function sanitizeClientId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
}

export function defaultSeats(count = 4): Seat[] {
  const names = ['Amelie', 'Bruno', 'Chiara', 'Dorian', 'Elena', 'Farid']
  return names.slice(0, Math.min(4, Math.max(3, count))).map((name, i) => ({
    id: `p${i + 1}`,
    name,
    isBot: i > 0,
    claimedBy: null,
  }))
}
