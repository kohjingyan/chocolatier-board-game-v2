import { Server, routePartykitRequest, type Connection, type ConnectionContext } from 'partyserver'
import { RoomLogic } from '../src/net/roomLogic'
import type { PersistedRoom } from '../src/net/protocol'

function readMessage(message: string | ArrayBuffer | ArrayBufferView): string {
  if (typeof message === 'string') return message
  const view = message instanceof ArrayBuffer ? new Uint8Array(message) : new Uint8Array(message.buffer, message.byteOffset, message.byteLength)
  return new TextDecoder().decode(view)
}

export class Room extends Server {
  static options = { hibernate: false }

  private logic = new RoomLogic(
    (connId, msg) => {
      this.getConnection(connId)?.send(JSON.stringify(msg))
    },
    () => [...this.getConnections()].map((c) => c.id),
    (data) => {
      void this.ctx.storage.put('room', data)
    },
  )

  async onStart() {
    const saved = await this.ctx.storage.get<PersistedRoom>('room')
    if (saved) this.logic.hydrate(saved)
  }

  onConnect(connection: Connection, _ctx: ConnectionContext) {
    this.logic.onConnect(connection.id)
  }

  onClose(connection: Connection) {
    this.logic.onClose(connection.id)
  }

  onMessage(connection: Connection, message: string | ArrayBuffer | ArrayBufferView) {
    this.logic.onMessage(connection.id, readMessage(message))
  }
}

type Env = { Room: DurableObjectNamespace }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
  },
}
