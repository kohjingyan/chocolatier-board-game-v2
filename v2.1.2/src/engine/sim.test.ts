import { describe, expect, it } from 'vitest'
import { flushBots } from './bot'
import { resetUid } from './data'
import { initialState, reduce } from './game'

describe('bot simulation', () => {
  it('plays a 4-bot game to completion', () => {
    resetUid()
    let state = initialState()
    state.seed = 42
    state = reduce(state, {
      type: 'START',
      config: {
        seats: [
          { name: 'A', isBot: true },
          { name: 'B', isBot: true },
          { name: 'C', isBot: true },
          { name: 'D', isBot: true },
        ],
      },
    })
    state = flushBots(state)
    expect(state.phase).toBe('game_over')
    expect(state.players.every((p) => p.cash >= 0)).toBe(true)
  })
})
