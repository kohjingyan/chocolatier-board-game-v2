import { describe, expect, it } from 'vitest'
import { botAction, flushBots } from './bot'
import { setForceLearnedPolicy } from './botPolicy'
import { botStyleFor } from './botWeights'
import { resetUid } from './data'
import { initialState, reduce } from './game'
import { finalScores } from './queries'
import type { GameState, Player } from './types'

function dummyPlayer(partial: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'A',
    isBot: true,
    cash: 20,
    hand: [],
    schemes: [],
    supply: [],
    factories: [
      { id: 'p1-f1', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
      { id: 'p1-f2', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
    ],
    extraSlotPool: 0,
    extraHazardPool: 0,
    boughtRepSlot: false,
    boughtRepSlotL2: false,
    boughtExtraFactory: false,
    boughtJuniorResearcher: false,
    boughtSeniorResearcherL2: false,
    boughtSeniorResearcherL3: false,
    assignedResP: 0,
    assignedRepP: 0,
    earnedRecipeRep: 0,
    reliefResP: 0,
    reliefRepP: 0,
    reliefPenalty: 0,
    spentRep: 0,
    completedRecipes: [],
    mastery: null,
    unlicensedRecipes: [],
    schemePlayedThisRound: false,
    lastIncome: 0,
    lastFactoryIncome: 0,
    lastBreakdown: { factories: 0, research: 0, reputation: 0, masteries: 0, total: 0 },
    ...partial,
  }
}

function baseState(partial: Partial<GameState> = {}): GameState {
  return {
    ...initialState(),
    playerCount: 3,
    stage: 1,
    round: 1,
    effects: [],
    ...partial,
  }
}

describe('stronger bot', () => {
  it('bids hard for the opening market instead of $0–$1', () => {
    const bot = dummyPlayer({
      cash: 20,
      hand: [
        { uid: 'm1', kind: 'ingredient', name: 'Matcha', cost: 12, stage: 1, family: 'matcha' },
        { uid: 'c1', kind: 'ingredient', name: 'Basic Cocoa', cost: 1, stage: 1, family: 'cocoa' },
        { uid: 's1', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' },
      ],
    })
    const state = baseState({
      players: [bot, dummyPlayer({ id: 'p2', name: 'B', isBot: false }), dummyPlayer({ id: 'p3', name: 'C', isBot: false })],
      phase: 'bid',
      turnOrder: ['p1', 'p2', 'p3'],
      round: 1,
      stage: 1,
    })
    const action = botAction(state)
    expect(action?.type).toBe('BID')
    if (action?.type !== 'BID') return
    expect(action.amount).toBeGreaterThanOrEqual(5)
    expect(action.amount).toBeLessThanOrEqual(8)
  })

  it('re-bids from leftover cash and still reserves enough to buy', () => {
    const hand = [
      { uid: 'm1', kind: 'ingredient' as const, name: 'Matcha', cost: 12, stage: 1 as const, family: 'matcha' as const },
      { uid: 'c1', kind: 'ingredient' as const, name: 'Basic Cocoa', cost: 1, stage: 1 as const, family: 'cocoa' as const },
    ]
    const broke = dummyPlayer({ cash: 12, hand })
    const spare = dummyPlayer({
      id: 'p2',
      name: 'B',
      cash: 16,
      hand,
      factories: [
        { id: 'p2-f1', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
        { id: 'p2-f2', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
      ],
    })
    const other = dummyPlayer({ id: 'p3', name: 'C', isBot: false })
    const tied = baseState({
      players: [broke, spare, other],
      phase: 'bid_tie',
      bidRound: 'tie',
      tieIds: ['p1', 'p2'],
      turnOrder: ['p1', 'p2', 'p3'],
      round: 1,
      stage: 1,
      bids: {},
    })
    const protect = botAction(tied)
    expect(protect).toEqual({ type: 'BID', amount: 0, actorId: 'p1' })

    const leftover = botAction({
      ...tied,
      bids: { p1: 0 },
    })
    expect(leftover?.type).toBe('BID')
    if (leftover?.type !== 'BID') return
    expect(leftover.actorId).toBe('p2')
    expect(leftover.amount).toBeGreaterThan(0)
    expect(leftover.amount).toBeLessThanOrEqual(4)
  })

  it('gives seats different play styles', () => {
    expect(botStyleFor('p1', 42).id).not.toBe(botStyleFor('p2', 42).id)
  })

  it('skips weak cash relief instead of always taking it', () => {
    const picker = dummyPlayer({ cash: 40, assignedResP: 0 })
    const other = dummyPlayer({ id: 'p2', name: 'B', isBot: false, cash: 80, assignedResP: 4 })
    const third = dummyPlayer({ id: 'p3', name: 'C', isBot: false, cash: 70, assignedResP: 3 })
    const state = baseState({
      players: [picker, other, third],
      phase: 'relief',
      stage: 1,
      round: 8,
      turnOrder: ['p1', 'p2', 'p3'],
      reliefQueue: ['p1'],
      reliefIndex: 0,
      reliefMax: { p1: 1 },
      reliefPicks: {},
    })
    expect(botAction(state)).toEqual({ type: 'SKIP_RELIEF', actorId: 'p1' })
  })

  it('takes Research relief when it would unlock the next track level', () => {
    const picker = dummyPlayer({ cash: 12, assignedResP: 2 })
    const other = dummyPlayer({ id: 'p2', name: 'B', isBot: false, cash: 40, assignedResP: 1 })
    const third = dummyPlayer({ id: 'p3', name: 'C', isBot: false, cash: 40, assignedResP: 1 })
    const state = baseState({
      players: [picker, other, third],
      phase: 'relief',
      stage: 1,
      round: 8,
      turnOrder: ['p1', 'p2', 'p3'],
      reliefQueue: ['p1'],
      reliefIndex: 0,
      reliefMax: { p1: 1 },
      reliefPicks: {},
    })
    expect(botAction(state)).toEqual({ type: 'CHOOSE_RELIEF', kind: 'res', actorId: 'p1' })
  })

  it('targets an opponent ingredient with Artificial Shortage instead of its own', () => {
    const caster = dummyPlayer({
      supply: [{ uid: 'cocoa-1', kind: 'ingredient', name: 'Basic Cocoa', cost: 1, stage: 1, family: 'cocoa' }],
    })
    const opp = dummyPlayer({
      id: 'p2',
      name: 'B',
      isBot: false,
      supply: [{ uid: 'matcha-1', kind: 'ingredient', name: 'Matcha', cost: 12, stage: 1, family: 'matcha' }],
    })
    const third = dummyPlayer({
      id: 'p3',
      name: 'C',
      isBot: false,
      supply: [{ uid: 'matcha-2', kind: 'ingredient', name: 'Matcha', cost: 12, stage: 1, family: 'matcha' }],
    })
    const state = baseState({
      players: [caster, opp, third],
      phase: 'scheme',
      turnOrder: ['p1', 'p2', 'p3'],
      actorIndex: 0,
      pendingScheme: {
        playerId: 'p1',
        cardUid: 's1',
        schemeId: 'artificial_shortage',
        name: 'Artificial Shortage',
        playCost: 1,
        targets: {},
        awaitingTargets: true,
      },
    })
    expect(botAction(state)).toEqual({
      type: 'CONFIRM_SCHEME_TARGETS',
      targets: { family: 'matcha' },
    })
  })

  it('plays Private Viewing when a valuable pool card would otherwise be taken first', () => {
    const honey = {
      uid: 'honey-1',
      kind: 'ingredient' as const,
      name: 'Royal Honey',
      cost: 60,
      stage: 3 as const,
      family: 'royal_honey' as const,
    }
    const bot = dummyPlayer({
      cash: 90,
      assignedResP: 11,
      assignedRepP: 6,
      schemes: [{ uid: 'pv', schemeId: 'private_viewing', name: 'Private Viewing' }],
      supply: [
        { uid: 'cocoa-1', kind: 'ingredient', name: 'Basic Cocoa', cost: 1, stage: 1, family: 'cocoa' },
        { uid: 'sugar-1', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' },
      ],
    })
    const first = dummyPlayer({ id: 'p2', name: 'B', isBot: false, cash: 90 })
    const state = baseState({
      players: [bot, first],
      playerCount: 3,
      phase: 'private_viewing',
      stage: 3,
      round: 2,
      turnOrder: ['p2', 'p1'],
      actorIndex: 0,
      pool: [honey],
      pvQueue: [],
      pvPassed: ['p2'],
    })
    expect(botAction(state)).toEqual({
      type: 'PLAY_PRIVATE_VIEWING',
      cardUid: 'pv',
      actorId: 'p1',
    })
  })

  it('buys the mastery with the better endgame score, not the first listed', () => {
    const bot = dummyPlayer({
      cash: 80,
      assignedResP: 12,
      completedRecipes: ['basic', 'dark', 'milk', 'matcha', 'white', 'coffee'],
      mastery: null,
    })
    const other = dummyPlayer({ id: 'p2', name: 'B', isBot: false, assignedResP: 4 })
    const state = baseState({
      players: [bot, other],
      phase: 'purchase',
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
      masteryMarket: [
        { uid: 'm-tycoon', kind: 'mastery', name: 'Tycoon', cost: 50, stage: 1, masteryId: 'tycoon' },
        {
          uid: 'm-exp',
          kind: 'mastery',
          name: 'Experimentalist',
          cost: 50,
          stage: 1,
          masteryId: 'experimentalist',
        },
      ],
      pool: [{ uid: 'pool-1', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' }],
    })
    expect(botAction(state)).toEqual({ type: 'BUY_MASTERY', cardUid: 'm-exp' })
  })

  it('plays a 4-bot game to completion on several seeds and actually builds factories', () => {
    for (const seed of [1, 7, 42, 99]) {
      resetUid()
      let state = initialState()
      state.seed = seed
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
      expect(state.phase, `seed ${seed}`).toBe('game_over')
      expect(state.players.every((p) => p.cash >= 0), `seed ${seed} cash`).toBe(true)
      expect(
        state.players.some((p) => p.factories.some((f) => f.recipeId)),
        `seed ${seed} recipes`,
      ).toBe(true)
      const filled = state.players.reduce((n, p) => n + p.factories.filter((f) => f.recipeId).length, 0)
      expect(filled, `seed ${seed} filled factories`).toBeGreaterThanOrEqual(8)
      const scores = finalScores(state)
      expect(Math.max(...scores.map((s) => s.total))).toBeGreaterThan(40)
    }
  })

  it('tears down a weaker recipe for a better one at no cost, even on the learned path', () => {
    setForceLearnedPolicy(true)
    const cocoa = { uid: 'c1', kind: 'ingredient' as const, name: 'Basic Cocoa', cost: 1, stage: 1 as const, family: 'cocoa' as const }
    const sugar = { uid: 's1', kind: 'ingredient' as const, name: 'Sugar', cost: 1, stage: 1 as const, family: 'sugar' as const }
    const matcha = { uid: 'm1', kind: 'ingredient' as const, name: 'Matcha', cost: 12, stage: 1 as const, family: 'matcha' as const }
    const bot = dummyPlayer({
      supply: [matcha],
      factories: [
        {
          id: 'p1-f1',
          extraSlots: 0,
          hazardousSlots: 0,
          ingredients: [cocoa, sugar],
          recipeId: 'basic',
        },
        { id: 'p1-f2', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
      ],
    })
    const other = dummyPlayer({ id: 'p2', name: 'B', isBot: false })
    let state = baseState({
      players: [bot, other],
      playerCount: 2,
      phase: 'assignment',
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
    })
    const tear = botAction(state)
    expect(tear).toEqual({ type: 'TEAR_DOWN', factoryId: 'p1-f1', actorId: 'p1' })
    state = reduce(state, tear!)
    const assign = botAction(state)
    expect(assign).toEqual({
      type: 'ASSIGN_RECIPE',
      factoryId: 'p1-f1',
      cardUids: ['c1', 'm1', 's1'],
      actorId: 'p1',
    })
    state = reduce(state, assign!)
    expect(state.players[0].factories[0].recipeId).toBe('matcha')
    setForceLearnedPolicy(false)
  })

  it('fills both factories with Basic Chocolate instead of one Dark when income is equal', () => {
    setForceLearnedPolicy(true)
    const bot = dummyPlayer({
      supply: [
        { uid: 'c1', kind: 'ingredient', name: 'Basic Cocoa', cost: 1, stage: 1, family: 'cocoa' },
        { uid: 'c2', kind: 'ingredient', name: 'Basic Cocoa', cost: 1, stage: 1, family: 'cocoa' },
        { uid: 's1', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' },
        { uid: 's2', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' },
      ],
    })
    const other = dummyPlayer({ id: 'p2', name: 'B', isBot: false })
    let state = baseState({
      players: [bot, other],
      playerCount: 2,
      phase: 'assignment',
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
    })
    for (let i = 0; i < 6; i += 1) {
      const action = botAction(state)
      if (!action || action.type === 'FINISH_ASSIGNMENT') break
      state = reduce(state, action)
    }
    const recipes = state.players[0].factories.map((f) => f.recipeId).filter(Boolean)
    expect(recipes).toEqual(['basic', 'basic'])
    setForceLearnedPolicy(false)
  })

  it('collects a new Dark recipe late because 1 Rep is at least 4 VP', () => {
    setForceLearnedPolicy(true)
    const bot = dummyPlayer({
      completedRecipes: ['basic'],
      supply: [
        { uid: 'c1', kind: 'ingredient', name: 'Basic Cocoa', cost: 1, stage: 1, family: 'cocoa' },
        { uid: 'c2', kind: 'ingredient', name: 'Basic Cocoa', cost: 1, stage: 1, family: 'cocoa' },
        { uid: 's1', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' },
        { uid: 's2', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' },
      ],
    })
    const other = dummyPlayer({ id: 'p2', name: 'B', isBot: false })
    let state = baseState({
      players: [bot, other],
      playerCount: 2,
      phase: 'assignment',
      stage: 3,
      round: 8,
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
    })
    for (let i = 0; i < 6; i += 1) {
      const action = botAction(state)
      if (!action || action.type === 'FINISH_ASSIGNMENT') break
      state = reduce(state, action)
    }
    expect(state.players[0].factories.some((f) => f.recipeId === 'dark')).toBe(true)
    setForceLearnedPolicy(false)
  })

  it('buys Open Market cocoa or sugar to fill idle factories', () => {
    setForceLearnedPolicy(true)
    const bot = dummyPlayer({
      cash: 20,
      supply: [
        { uid: 'c1', kind: 'ingredient', name: 'Basic Cocoa', cost: 1, stage: 1, family: 'cocoa' },
        { uid: 's1', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' },
      ],
    })
    const other = dummyPlayer({ id: 'p2', name: 'B', isBot: false })
    const state = baseState({
      players: [bot, other],
      playerCount: 2,
      phase: 'purchase',
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
      openCocoa: 4,
      openSugar: 4,
      pool: [{ uid: 'pool-1', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' }],
    })
    expect(botAction(state)).toEqual({ type: 'BUY_OPEN', item: 'cocoa' })
    setForceLearnedPolicy(false)
  })

  it('uses leftover cocoa and sugar for Basic Chocolate on idle factories', () => {
    setForceLearnedPolicy(true)
    const bot = dummyPlayer({
      completedRecipes: ['matcha'],
      factories: [
        {
          id: 'p1-f1',
          extraSlots: 0,
          hazardousSlots: 0,
          ingredients: [
            { uid: 'mc', kind: 'ingredient', name: 'Basic Cocoa', cost: 1, stage: 1, family: 'cocoa' },
            { uid: 'mm', kind: 'ingredient', name: 'Matcha', cost: 12, stage: 1, family: 'matcha' },
            { uid: 'ms', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' },
          ],
          recipeId: 'matcha',
        },
        { id: 'p1-f2', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
        { id: 'p1-f3', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
        { id: 'p1-f4', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
      ],
      supply: [
        { uid: 'c1', kind: 'ingredient', name: 'Basic Cocoa', cost: 1, stage: 1, family: 'cocoa' },
        { uid: 'c2', kind: 'ingredient', name: 'Basic Cocoa', cost: 1, stage: 1, family: 'cocoa' },
        { uid: 's1', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' },
        { uid: 's2', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' },
      ],
    })
    const other = dummyPlayer({ id: 'p2', name: 'B', isBot: false })
    let state = baseState({
      players: [bot, other],
      playerCount: 2,
      phase: 'assignment',
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
    })
    for (let i = 0; i < 8; i += 1) {
      const action = botAction(state)
      if (!action || action.type === 'FINISH_ASSIGNMENT') break
      state = reduce(state, action)
    }
    const player = state.players[0]
    const recipes = player.factories.map((f) => f.recipeId)
    expect(recipes, JSON.stringify({ recipes, supply: player.supply.map((c) => c.name) })).toEqual(
      expect.arrayContaining(['matcha', 'basic', 'basic']),
    )
    expect(recipes.filter((id) => id === 'basic')).toHaveLength(2)
    expect(player.supply.filter((c) => c.family === 'cocoa' || c.family === 'sugar')).toHaveLength(0)
    setForceLearnedPolicy(false)
  })
})
