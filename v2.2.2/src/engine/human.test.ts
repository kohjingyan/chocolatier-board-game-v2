import { describe, expect, it } from 'vitest'
import { flushBots } from './bot'
import { resetUid } from './data'
import { initialState, reduce } from './game'

describe('hot-seat handoff', () => {
  it('stops for a human bidder instead of auto-playing', () => {
    resetUid()
    let state = initialState()
    state.seed = 7
    state = reduce(state, {
      type: 'START',
      config: {
        seats: [
          { name: 'Human', isBot: false },
          { name: 'BotA', isBot: true },
          { name: 'BotB', isBot: true },
          { name: 'BotC', isBot: true },
        ],
      },
    })
    state = flushBots(state)
    expect(['curtain', 'bid']).toContain(state.phase)
    expect(state.players[0].hand.length).toBe(9)
    expect(state.round).toBe(1)
    expect(state.stage).toBe(1)
  })
})
