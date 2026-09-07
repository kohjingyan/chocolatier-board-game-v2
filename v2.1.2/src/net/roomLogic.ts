import { flushBots } from '../engine/bot'
import { ensureUidAtLeast } from '../engine/data'
import { filterStateForPlayer } from '../engine/filterState'
import { canPlayerAct, initialState, reduce } from '../engine/game'
import type { GameState } from '../engine/types'
import {
  defaultSeats,
  sanitizeClientId,
  sanitizeName,
  type ClientMessage,
  type RoomSnapshot,
  type Seat,
  type ServerMessage,
} from './protocol'

export class RoomLogic {
  hostId = ''
  seats: Seat[] = defaultSeats(4)
  marketMode: 'contribute' | 'direct' = 'contribute'
  game: GameState | null = null
  clients = new Map<string, string>()

  constructor(private readonly emit: (connId: string, msg: ServerMessage) => void, private readonly allIds: () => string[]) {}

  onConnect(connId: string) {
    this.push(connId)
  }

  onClose(connId: string) {
    this.clients.delete(connId)
  }

  onMessage(connId: string, raw: string) {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw) as ClientMessage
    } catch {
      this.err(connId, 'Bad message.')
      return
    }
    try {
      this.handle(msg, connId)
    } catch {
      this.err(connId, 'Could not apply that.')
    }
  }

  private handle(msg: ClientMessage, connId: string) {
    if (msg.type === 'hello') {
      const clientId = sanitizeClientId(msg.clientId)
      if (!clientId) {
        this.err(connId, 'Missing client id.')
        return
      }
      this.clients.set(connId, clientId)
      if (!this.hostId) this.hostId = clientId
      if (msg.name) {
        const name = sanitizeName(msg.name).trim()
        const seat = this.seats.find((s) => s.claimedBy === clientId)
        if (seat && name) seat.name = name
      }
      if (clientId === this.hostId && !this.game && !this.seats.some((s) => s.claimedBy === clientId)) {
        const open = this.seats.find((s) => !s.isBot && !s.claimedBy)
        if (open) open.claimedBy = clientId
      }
      this.broadcast()
      return
    }

    const clientId = this.clients.get(connId)
    if (!clientId) {
      this.err(connId, 'Say hello first.')
      return
    }
    const isHost = clientId === this.hostId

    if (msg.type === 'claimSeat') {
      if (this.game) {
        this.err(connId, 'The game has already started.')
        return
      }
      const seat = this.seats.find((s) => s.id === msg.seatId)
      if (!seat || seat.isBot) {
        this.err(connId, 'That seat is not open.')
        return
      }
      if (seat.claimedBy && seat.claimedBy !== clientId) {
        this.err(connId, 'That seat is taken.')
        return
      }
      for (const s of this.seats) {
        if (s.claimedBy === clientId) s.claimedBy = null
      }
      seat.claimedBy = clientId
      const name = sanitizeName(msg.name)
      if (name) seat.name = name
      this.broadcast()
      return
    }

    if (msg.type === 'releaseSeat') {
      if (this.game) return
      const seat = this.seats.find((s) => s.id === msg.seatId)
      if (seat && seat.claimedBy === clientId) seat.claimedBy = null
      this.broadcast()
      return
    }

    if (msg.type === 'setSeat') {
      if (!isHost || this.game) return
      const seat = this.seats.find((s) => s.id === msg.seatId)
      if (!seat) return
      const name = sanitizeName(msg.name)
      if (name.trim()) seat.name = name.trim()
      seat.isBot = Boolean(msg.isBot)
      if (seat.isBot) seat.claimedBy = null
      this.broadcast()
      return
    }

    if (msg.type === 'setCount') {
      if (!isHost || this.game) return
      const count = Math.floor(msg.count)
      if (count < 3 || count > 6) return
      const next = defaultSeats(count)
      for (const s of next) {
        const prev = this.seats.find((x) => x.id === s.id)
        if (prev) {
          s.name = prev.name
          s.isBot = prev.isBot
          s.claimedBy = prev.claimedBy
        }
      }
      this.seats = next
      this.broadcast()
      return
    }

    if (msg.type === 'setMarketMode') {
      if (!isHost || this.game) return
      if (msg.mode !== 'contribute' && msg.mode !== 'direct') return
      this.marketMode = msg.mode
      this.broadcast()
      return
    }

    if (msg.type === 'start') {
      if (!isHost || this.game) return
      this.syncUids(null)
      let state = initialState()
      state.playMode = 'online'
      state = reduce(state, {
        type: 'START',
        config: {
          playMode: 'online',
          marketMode: this.marketMode,
          seats: this.seats.map((s) => ({
            name: s.name,
            isBot: s.isBot || !s.claimedBy,
          })),
        },
      })
      this.game = flushBots(state)
      this.broadcast()
      return
    }

    if (msg.type === 'newGame') {
      if (!isHost) return
      this.game = null
      this.broadcast()
      return
    }

    if (msg.type === 'action') {
      if (!this.game) return
      const action = msg.action
      if (!action || typeof action.type !== 'string') return
      if (action.type === 'START' || action.type === 'NEW_GAME') return
      if ((action.type === 'SET_RECIPE_INCOME' || action.type === 'SET_CARD_COST') && !isHost) return
      const playerId = this.seats.find((s) => s.claimedBy === clientId)?.id ?? null
      if (!canPlayerAct(this.game, playerId, action)) {
        this.err(connId, 'Not your turn.')
        return
      }
      this.syncUids(this.game)
      this.game = flushBots(reduce(this.game, action))
      this.broadcast()
    }
  }

  private snapshotFor(clientId: string | undefined): RoomSnapshot {
    const playerId = this.seats.find((s) => s.claimedBy === clientId)?.id ?? null
    return {
      hostId: this.hostId,
      seats: this.seats,
      marketMode: this.marketMode,
      game: this.game && clientId ? filterStateForPlayer(this.game, playerId) : this.game,
    }
  }

  private push(connId: string) {
    const clientId = this.clients.get(connId) ?? ''
    this.emit(connId, { type: 'snapshot', room: this.snapshotFor(clientId), you: clientId })
  }

  private broadcast() {
    for (const id of this.allIds()) this.push(id)
  }

  private err(connId: string, message: string) {
    this.emit(connId, { type: 'error', message })
  }

  private syncUids(state: GameState | null) {
    let max = 0
    const eat = (s: string) => {
      const m = s.match(/(\d+)$/)
      if (m) max = Math.max(max, Number(m[1]))
    }
    if (!state) {
      ensureUidAtLeast(0)
      return
    }
    for (const p of state.players) {
      for (const c of [...p.hand, ...p.supply, ...p.factories.flatMap((f) => f.ingredients)]) eat(c.uid)
      for (const s of p.schemes) eat(s.uid)
    }
    for (const c of [...state.pool, ...state.publicDiscard, ...state.leftoverDiscard, ...state.stageDeck]) eat(c.uid)
    for (const s of [...state.schemeDeck, ...state.schemeDiscard]) eat(s.uid)
    ensureUidAtLeast(max)
  }
}
