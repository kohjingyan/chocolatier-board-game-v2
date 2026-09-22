import { describe, expect, it } from 'vitest'
import { flushBots } from './bot'
import { randomPolicy, setForceLearnedPolicy, setPolicy, setSeatPolicies } from './botPolicy'
import { resetUid } from './data'
import { initialState, reduce } from './game'

describe('learned policy', () => {
  it('can finish a 4-bot game from a random policy', () => {
    setForceLearnedPolicy(true)
    setPolicy(randomPolicy(9, 1.4))
    resetUid()
    let state = initialState()
    state.seed = 11
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
    setForceLearnedPolicy(false)
    expect(state.phase).toBe('game_over')
    expect(state.players.every((p) => p.cash >= 0)).toBe(true)
  })

  it('can finish a table of four different genomes', () => {
    setForceLearnedPolicy(true)
    setSeatPolicies({
      p1: randomPolicy(1, 1.3),
      p2: randomPolicy(2, 1.1),
      p3: randomPolicy(3, 0.9),
      p4: randomPolicy(4, 1.5),
    })
    resetUid()
    let state = initialState()
    state.seed = 21
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
    setSeatPolicies(null)
    setForceLearnedPolicy(false)
    expect(state.phase).toBe('game_over')
  })
})
