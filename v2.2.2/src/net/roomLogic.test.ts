import { describe, expect, it } from 'vitest'
import { RoomLogic } from './roomLogic'
import type { PersistedRoom, ServerMessage } from './protocol'

function room() {
  const inbox = new Map<string, ServerMessage[]>()
  const ids = ['c1']
  const logic = new RoomLogic(
    (connId, msg) => {
      const list = inbox.get(connId) ?? []
      list.push(msg)
      inbox.set(connId, list)
    },
    () => ids,
  )
  return { logic, inbox, ids }
}

describe('room lobby', () => {
  it('lets the first client host and edit seats after hello', () => {
    const { logic, inbox } = room()
    logic.onConnect('c1')
    logic.onMessage('c1', JSON.stringify({ type: 'hello', clientId: 'host-1' }))
    const afterHello = inbox.get('c1')?.at(-1)
    expect(afterHello?.type).toBe('snapshot')
    if (afterHello?.type !== 'snapshot') throw new Error('expected snapshot')
    expect(afterHello.you).toBe('host-1')
    expect(afterHello.room.hostId).toBe('host-1')
    expect(afterHello.room.seats[0]?.claimedBy).toBe('host-1')

    logic.onMessage(
      'c1',
      JSON.stringify({ type: 'setSeat', seatId: 'p2', name: 'Jules', isBot: false }),
    )
    const afterEdit = inbox.get('c1')?.at(-1)
    expect(afterEdit?.type).toBe('snapshot')
    if (afterEdit?.type !== 'snapshot') throw new Error('expected snapshot')
    expect(afterEdit.room.seats[1]?.name).toBe('Jules')
    expect(afterEdit.room.seats[1]?.isBot).toBe(false)
  })

  it('restores a started game after a reconnect', () => {
    const persisted: PersistedRoom[] = []
    const inbox = new Map<string, ServerMessage[]>()
    const ids = ['c1']
    const logic = new RoomLogic(
      (connId, msg) => {
        const list = inbox.get(connId) ?? []
        list.push(msg)
        inbox.set(connId, list)
      },
      () => ids,
      (data) => {
        persisted.splice(0, persisted.length, data)
      },
    )
    logic.onConnect('c1')
    logic.onMessage('c1', JSON.stringify({ type: 'hello', clientId: 'host-1' }))
    logic.onMessage('c1', JSON.stringify({ type: 'start' }))
    expect(logic.game).not.toBeNull()
    expect(persisted.at(-1)?.game).not.toBeNull()

    const inbox2 = new Map<string, ServerMessage[]>()
    const ids2 = ['c-new']
    const restored = new RoomLogic(
      (connId, msg) => {
        const list = inbox2.get(connId) ?? []
        list.push(msg)
        inbox2.set(connId, list)
      },
      () => ids2,
    )
    restored.hydrate(persisted.at(-1)!)
    restored.onConnect('c-new')
    restored.onMessage('c-new', JSON.stringify({ type: 'hello', clientId: 'host-1' }))
    const snap = inbox2.get('c-new')?.at(-1)
    expect(snap?.type).toBe('snapshot')
    if (snap?.type !== 'snapshot') throw new Error('expected snapshot')
    expect(snap.room.game).not.toBeNull()
    expect(snap.room.seats[0]?.claimedBy).toBe('host-1')
    expect(snap.you).toBe('host-1')
  })
})
