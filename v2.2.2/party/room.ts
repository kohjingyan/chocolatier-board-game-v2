import type * as Party from 'partykit/server'
import type { PersistedRoom, ServerMessage } from '../src/net/protocol'
import { RoomLogic } from '../src/net/roomLogic'

export default class GameRoom implements Party.Server {
  private logic: RoomLogic

  constructor(readonly room: Party.Room) {
    this.logic = new RoomLogic(
      (connId, msg) => {
        const conn = [...this.room.getConnections()].find((c) => c.id === connId)
        conn?.send(JSON.stringify(msg))
      },
      () => [...this.room.getConnections()].map((c) => c.id),
      (data) => {
        void this.room.storage.put('room', data)
      },
    )
  }

  async onStart() {
    const saved = await this.room.storage.get<PersistedRoom>('room')
    if (saved) this.logic.hydrate(saved)
  }

  onConnect(conn: Party.Connection) {
    this.logic.onConnect(conn.id)
  }

  onClose(conn: Party.Connection) {
    this.logic.onClose(conn.id)
  }

  onMessage(raw: string | ArrayBuffer, sender: Party.Connection) {
    this.logic.onMessage(sender.id, typeof raw === 'string' ? raw : '')
  }
}

export type { ServerMessage }
