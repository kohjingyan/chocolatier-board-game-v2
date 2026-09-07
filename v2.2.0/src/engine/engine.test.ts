import { describe, expect, it } from 'vitest'
import { buildStageDeck, discardPay, factoryLimit, recipeById, RECIPES, resetUid, SCHEME_INFO, schemePlayCost } from './data'
import { playerFactoryIncome } from './income'
import { filterStateForPlayer } from './filterState'
import { canDrawScheme, canPlayerAct, initialState, partitionDiceTies, reduce } from './game'
import { reliefAllowance, reliefRanks } from './relief'
import { buildableOnFactory, canAssignRecipe, faceCost, matchesRecipe, mostReputableId, poolPrice, requiredResLevel, repLevel, resLevel, resP, visibleCash } from './queries'
import { flushBots } from './bot'
import type { GameState, Player } from './types'

function dummyPlayer(partial: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'A',
    isBot: false,
    cash: 20,
    hand: [],
    schemes: [],
    supply: [],
    factories: [],
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

describe('decks', () => {
  it('deals exactly 9 cards per player', () => {
    resetUid()
    for (const n of [3, 4]) {
      for (const stage of [1, 2, 3] as const) {
        const deck = buildStageDeck(stage, n)
        expect(deck.length).toBe(9 * n)
      }
    }
  })
})

describe('recipes', () => {
  it('matches dark chocolate and not basic', () => {
    const dark = RECIPES.find((r) => r.id === 'dark')!
    const basic = RECIPES.find((r) => r.id === 'basic')!
    const cards = [
      { uid: '1', kind: 'ingredient' as const, name: 'C', cost: 1, stage: 1 as const, family: 'cocoa' as const },
      { uid: '2', kind: 'ingredient' as const, name: 'C', cost: 1, stage: 1 as const, family: 'cocoa' as const },
      { uid: '3', kind: 'ingredient' as const, name: 'S', cost: 1, stage: 1 as const, family: 'sugar' as const },
    ]
    expect(matchesRecipe(cards, dark)).toBe(true)
    expect(matchesRecipe(cards, basic)).toBe(false)
  })

  it('unlocks recipe tiers one research level earlier', () => {
    expect(requiredResLevel(recipeById('basic'))).toBe(0)
    expect(requiredResLevel(recipeById('extra_dark'))).toBe(1)
    expect(requiredResLevel(recipeById('sea_salt'))).toBe(2)
    expect(requiredResLevel(recipeById('royal_assorted'))).toBe(3)
    const starter = dummyPlayer()
    const factory = { id: 'f1', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null }
    const cocoaSugar = [
      { uid: 'a', kind: 'ingredient' as const, name: 'Cocoa', cost: 1, stage: 1 as const, family: 'cocoa' as const },
      { uid: 'b', kind: 'ingredient' as const, name: 'Sugar', cost: 1, stage: 1 as const, family: 'sugar' as const },
    ]
    const state = { ...initialState(), playerCount: 4, players: [{ ...starter, supply: cocoaSugar, factories: [factory] }], effects: [] }
    expect(canAssignRecipe(state, state.players[0], factory, cocoaSugar).ok).toBe(true)
    expect(buildableOnFactory(state, state.players[0], factory).some((x) => x.recipe.id === 'basic')).toBe(true)
  })

  it('assigns basic chocolate through the game action', () => {
    const cocoaSugar = [
      { uid: 'a', kind: 'ingredient' as const, name: 'Cocoa', cost: 1, stage: 1 as const, family: 'cocoa' as const },
      { uid: 'b', kind: 'ingredient' as const, name: 'Sugar', cost: 1, stage: 1 as const, family: 'sugar' as const },
    ]
    const player = dummyPlayer({
      supply: cocoaSugar,
      factories: [
        { id: 'p1-f1', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
        { id: 'p1-f2', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
      ],
    })
    let state: GameState = {
      ...initialState(),
      playerCount: 4,
      players: [player],
      phase: 'assignment',
      turnOrder: ['p1'],
      actorIndex: 0,
      effects: [],
    }
    state = reduce(state, { type: 'ASSIGN_RECIPE', factoryId: 'p1-f1', cardUids: ['a', 'b'] })
    expect(state.players[0].factories[0].recipeId).toBe('basic')
    expect(state.players[0].supply).toHaveLength(0)
  })

  it('auto-picks basic chocolate when assign is clicked with no selection', () => {
    const cocoaSugar = [
      { uid: 'a', kind: 'ingredient' as const, name: 'Cocoa', cost: 1, stage: 1 as const, family: 'cocoa' as const },
      { uid: 'b', kind: 'ingredient' as const, name: 'Sugar', cost: 1, stage: 1 as const, family: 'sugar' as const },
    ]
    const player = dummyPlayer({
      supply: cocoaSugar,
      factories: [{ id: 'p1-f1', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null }],
    })
    let state: GameState = {
      ...initialState(),
      playerCount: 4,
      players: [player],
      phase: 'assignment',
      turnOrder: ['p1'],
      actorIndex: 0,
      effects: [],
    }
    state = reduce(state, { type: 'ASSIGN_RECIPE', factoryId: 'p1-f1', cardUids: [] })
    expect(state.players[0].factories[0].recipeId).toBe('basic')
  })
})

describe('tracks', () => {
  it('uses Research 3/7/11 and Reputation 4/12/20 with no passive ResP', () => {
    const p = dummyPlayer({ assignedResP: 3, assignedRepP: 12 })
    expect(repLevel(p)).toBe(2)
    expect(resP(p)).toBe(3)
    expect(resLevel(p)).toBe(1)
    p.assignedResP = 11
    expect(resP(p)).toBe(11)
    expect(resLevel(p)).toBe(3)
  })
})

describe('most reputable', () => {
  it('keeps the title on a tie and only moves when someone is strictly ahead', () => {
    const a = dummyPlayer({ id: 'p1', name: 'A', assignedRepP: 8 })
    const b = dummyPlayer({ id: 'p2', name: 'B', assignedRepP: 8 })
    const c = dummyPlayer({ id: 'p3', name: 'C', assignedRepP: 5 })
    const state = {
      ...initialState(),
      playerCount: 3,
      players: [a, b, c],
      mostReputableId: 'p1',
    } as GameState
    expect(mostReputableId(state)).toBe('p1')
    b.assignedRepP = 10
    expect(mostReputableId({ ...state, players: [a, b, c] })).toBe('p2')
    c.assignedRepP = 10
    expect(mostReputableId({ ...state, mostReputableId: 'p2', players: [a, b, c] })).toBe('p2')
    a.assignedRepP = 3
    expect(mostReputableId({ ...state, mostReputableId: 'p1', players: [a, b, c] })).toBe(null)
  })
})

describe('visible cash', () => {
  it('hides a posted bid on the rail until every bid is in', () => {
    const a = dummyPlayer({ id: 'p1', cash: 12 })
    const b = dummyPlayer({ id: 'p2', name: 'B', cash: 20 })
    const state = {
      ...initialState(),
      phase: 'bid' as const,
      players: [a, b],
      bids: { p1: 8 },
    } as GameState
    expect(visibleCash(state, a)).toBe(20)
    expect(visibleCash(state, b)).toBe(20)
    expect(visibleCash({ ...state, phase: 'bid_reveal' }, a)).toBe(12)
  })
})

describe('discounts', () => {
  it('applies Most Reputable first, then additive 25% of original', () => {
    const buyer = dummyPlayer({ id: 'p1', assignedRepP: 21, assignedResP: 11 })
    const other = dummyPlayer({ id: 'p2', name: 'B', assignedRepP: 5 })
    const state = {
      ...initialState(),
      playerCount: 2,
      players: [buyer, other],
      stage: 3,
      mostReputableId: 'p1',
    } as GameState
    const honey = {
      uid: 'h',
      kind: 'ingredient' as const,
      name: 'Royal Honey',
      cost: 60,
      stage: 3 as const,
      family: 'royal_honey' as const,
    }
    expect(poolPrice(state, buyer, honey)).toBe(27)
  })
})

describe('card cost overrides', () => {
  it('SET_CARD_COST updates face cost, pool price, and in-play cards', () => {
    const buyer = dummyPlayer({ id: 'p1' })
    const honey = {
      uid: 'h',
      kind: 'ingredient' as const,
      name: 'Royal Honey',
      cost: 60,
      stage: 3 as const,
      family: 'royal_honey' as const,
    }
    let state = {
      ...initialState(),
      playerCount: 1,
      players: [buyer],
      pool: [honey],
    } as GameState
    expect(faceCost(state, honey)).toBe(60)
    expect(poolPrice(state, buyer, honey)).toBe(60)
    state = reduce(state, { type: 'SET_CARD_COST', cardName: 'Royal Honey', cost: 10 })
    expect(state.costOverrides['Royal Honey']).toBe(10)
    expect(state.pool[0].cost).toBe(10)
    expect(faceCost(state, state.pool[0])).toBe(10)
    expect(poolPrice(state, state.players[0], state.pool[0])).toBe(10)
  })

  it('applies the Masteries row to every mastery card', () => {
    const mastery = {
      uid: 'm',
      kind: 'mastery' as const,
      name: 'Cocoa Mastery',
      cost: 25,
      stage: 3 as const,
    }
    let state = {
      ...initialState(),
      playerCount: 1,
      players: [dummyPlayer()],
      pool: [mastery],
    } as GameState
    state = reduce(state, { type: 'SET_CARD_COST', cardName: 'Masteries', cost: 8 })
    expect(faceCost(state, state.pool[0])).toBe(8)
    expect(state.pool[0].cost).toBe(8)
  })
})

describe('dice ties', () => {
  it('locks unique low rolls and only rerolls the remaining tie', () => {
    expect(partitionDiceTies(['a', 'b', 'c'], { a: 7, b: 7, c: 3 })).toEqual({
      prefix: [],
      pending: ['a', 'b'],
      suffix: ['c'],
    })
    expect(partitionDiceTies(['a', 'b', 'c'], { a: 9, b: 7, c: 7 })).toEqual({
      prefix: ['a'],
      pending: ['b', 'c'],
      suffix: [],
    })
  })
})

describe('recipe reputation timing', () => {
  it('awards recipe reputation only when assignment is finished', () => {
    const cocoaSugar = [
      { uid: 'a', kind: 'ingredient' as const, name: 'Cocoa', cost: 1, stage: 1 as const, family: 'cocoa' as const },
      { uid: 'b', kind: 'ingredient' as const, name: 'Sugar', cost: 1, stage: 1 as const, family: 'sugar' as const },
    ]
    const player = dummyPlayer({
      supply: cocoaSugar,
      factories: [{ id: 'p1-f1', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null }],
    })
    let state: GameState = {
      ...initialState(),
      playerCount: 4,
      players: [player],
      phase: 'assignment',
      turnOrder: ['p1'],
      actorIndex: 0,
      effects: [],
    }
    state = reduce(state, { type: 'ASSIGN_RECIPE', factoryId: 'p1-f1', cardUids: ['a', 'b'] })
    expect(state.players[0].earnedRecipeRep).toBe(0)
    expect(state.players[0].completedRecipes).toEqual([])
    state = reduce(state, { type: 'FINISH_ASSIGNMENT' })
    expect(state.players[0].completedRecipes).toContain('basic')
    expect(state.players[0].earnedRecipeRep).toBe(0)
    expect(state.firstIntroducedBy.basic).toBe('p1')
  })

  it('gives the global +1 only to the first player who develops a recipe', () => {
    const ingredients = (prefix: string) => [
      { uid: `${prefix}a`, kind: 'ingredient' as const, name: 'Cocoa', cost: 1, stage: 1 as const, family: 'cocoa' as const },
      { uid: `${prefix}b`, kind: 'ingredient' as const, name: 'Sugar', cost: 1, stage: 1 as const, family: 'sugar' as const },
    ]
    const a = dummyPlayer({
      id: 'p1',
      name: 'A',
      supply: ingredients('a'),
      factories: [{ id: 'p1-f1', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null }],
    })
    const b = dummyPlayer({
      id: 'p2',
      name: 'B',
      supply: ingredients('b'),
      factories: [{ id: 'p2-f1', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null }],
    })
    let state: GameState = {
      ...initialState(),
      playerCount: 2,
      players: [a, b],
      phase: 'assignment',
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
      effects: [],
    }
    state = reduce(state, { type: 'ASSIGN_RECIPE', factoryId: 'p1-f1', cardUids: ['aa', 'ab'] })
    state = reduce(state, { type: 'FINISH_ASSIGNMENT' })
    state = reduce(state, { type: 'ASSIGN_RECIPE', factoryId: 'p2-f1', cardUids: ['ba', 'bb'] })
    state = reduce(state, { type: 'FINISH_ASSIGNMENT' })
    expect(state.firstIntroducedBy.basic).toBe('p1')
    expect(state.players[0].completedRecipes).toContain('basic')
    expect(state.players[1].completedRecipes).toContain('basic')
    expect(state.players[0].earnedRecipeRep).toBe(0)
    expect(state.players[1].earnedRecipeRep).toBe(0)
  })
})

describe('private viewing', () => {
  it('does not auto-play Private Viewing for a human', () => {
    const player = dummyPlayer({
      schemes: [{ uid: 'pv1', schemeId: 'private_viewing', name: 'Private Viewing' }],
      assignedRepP: 5,
    })
    const bot = dummyPlayer({ id: 'p2', name: 'Bot', isBot: true })
    let state: GameState = {
      ...initialState(),
      playerCount: 2,
      players: [player, bot],
      phase: 'private_viewing',
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
      pool: [{ uid: 'x', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' }],
      effects: [],
    }
    state = flushBots(state)
    expect(state.phase).toBe('private_viewing')
    expect(state.players[0].schemes.some((c) => c.schemeId === 'private_viewing')).toBe(true)
    expect(state.pvQueue).toEqual([])
  })
})

describe('reputation slots', () => {
  it('sells a second extra slot at Reputation L2', () => {
    const player = dummyPlayer({ assignedRepP: 13, cash: 20, boughtRepSlot: true })
    let state: GameState = {
      ...initialState(),
      playerCount: 2,
      players: [player],
      phase: 'assignment',
      turnOrder: ['p1'],
      actorIndex: 0,
      effects: [],
    }
    state = reduce(state, { type: 'BUY_EXTRA_SLOT', track: 2 })
    expect(state.players[0].boughtRepSlotL2).toBe(true)
    expect(state.players[0].extraSlotPool).toBe(1)
    expect(state.players[0].cash).toBe(10)
  })

  it('sells the extra factory at Reputation L2 for $20M', () => {
    const player = dummyPlayer({ assignedRepP: 13, cash: 30 })
    let state: GameState = {
      ...initialState(),
      playerCount: 2,
      players: [player],
      phase: 'assignment',
      turnOrder: ['p1'],
      actorIndex: 0,
      effects: [],
    }
    state = reduce(state, { type: 'BUY_EXTRA_FACTORY' })
    expect(state.players[0].boughtExtraFactory).toBe(true)
    expect(state.players[0].factories).toHaveLength(1)
    expect(state.players[0].cash).toBe(10)
  })
})

describe('printed card costs', () => {
  it('prices extra ingredient slots by the stage they entered', () => {
    const state = initialState()
    expect(faceCost(state, { uid: 's1', kind: 'slot', name: 'Extra Ingredient Slot', cost: 5, stage: 1 })).toBe(5)
    expect(faceCost(state, { uid: 's2', kind: 'slot', name: 'Extra Ingredient Slot', cost: 5, stage: 2 })).toBe(10)
    expect(faceCost(state, { uid: 's3', kind: 'slot', name: 'Extra Ingredient Slot', cost: 5, stage: 3 })).toBe(15)
    expect(faceCost(state, { uid: 'm', kind: 'ingredient', name: 'Matcha', cost: 8, stage: 1, family: 'matcha' })).toBe(12)
    expect(faceCost(state, { uid: 'h', kind: 'ingredient', name: 'Royal Honey', cost: 60, stage: 3, family: 'royal_honey' })).toBe(60)
    expect(faceCost(state, { uid: 'm', kind: 'mastery', name: 'Chocolatier', cost: 48, stage: 3 })).toBe(50)
  })
})

describe('bot rebuild', () => {
  it('tears down a basic line to make dark chocolate', () => {
    const cocoa1 = { uid: 'c1', kind: 'ingredient' as const, name: 'Cocoa', cost: 1, stage: 1 as const, family: 'cocoa' as const }
    const cocoa2 = { uid: 'c2', kind: 'ingredient' as const, name: 'Cocoa', cost: 1, stage: 1 as const, family: 'cocoa' as const }
    const sugar = { uid: 's1', kind: 'ingredient' as const, name: 'Sugar', cost: 1, stage: 1 as const, family: 'sugar' as const }
    const player = dummyPlayer({
      isBot: true,
      supply: [cocoa2],
      factories: [
        { id: 'p1-f1', extraSlots: 0, hazardousSlots: 0, ingredients: [cocoa1, sugar], recipeId: 'basic' },
        { id: 'p1-f2', extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
      ],
    })
    const human = dummyPlayer({ id: 'p2', name: 'Human', isBot: false })
    let state: GameState = {
      ...initialState(),
      playerCount: 4,
      players: [player, human],
      phase: 'assignment',
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
      effects: [],
    }
    state = flushBots(state)
    expect(state.players[0].factories.some((f) => f.recipeId === 'dark')).toBe(true)
    expect(state.players[0].factories.some((f) => f.recipeId === 'basic')).toBe(false)
  })
})

describe('online mode', () => {
  it('skips the curtain for remote humans', () => {
    resetUid()
    let state = initialState()
    state = reduce(state, {
      type: 'START',
      config: {
        playMode: 'online',
        seats: [
          { name: 'A', isBot: false },
          { name: 'B', isBot: false },
          { name: 'C', isBot: true },
        ],
      },
    })
    expect(state.playMode).toBe('online')
    expect(state.phase).toBe('bid')
    expect(state.curtainPlayerId).toBeNull()
  })

  it('hides other hands and schemes from a viewer', () => {
    const me = dummyPlayer({
      id: 'p1',
      hand: [{ uid: 'h1', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' }],
      schemes: [{ uid: 's1', schemeId: 'private_viewing', name: 'Private Viewing' }],
    })
    const them = dummyPlayer({
      id: 'p2',
      name: 'B',
      hand: [{ uid: 'h2', kind: 'ingredient', name: 'Matcha', cost: 4, stage: 1, family: 'matcha' }],
      schemes: [{ uid: 's2', schemeId: 'black_market', name: 'Black Market' }],
    })
    const state = {
      ...initialState(),
      playMode: 'hotseat' as const,
      players: [me, them],
    }
    const view = filterStateForPlayer(state, 'p1')
    expect(view.players[0].hand[0].name).toBe('Sugar')
    expect(view.players[1].hand[0].name).toBe('Hidden card')
    expect(view.players[1].schemes).toEqual([])
    const hidden = filterStateForPlayer(state, null)
    expect(hidden.players[0].hand[0].name).toBe('Hidden card')
    expect(hidden.players[1].hand[0].name).toBe('Hidden card')
  })

  it('rejects off-turn actions for another player during purchase', () => {
    const state = {
      ...initialState(),
      playMode: 'online' as const,
      phase: 'purchase' as const,
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
      players: [dummyPlayer({ id: 'p1' }), dummyPlayer({ id: 'p2', name: 'B' })],
    }
    expect(canPlayerAct(state, 'p1')).toBe(true)
    expect(canPlayerAct(state, 'p2')).toBe(false)
    expect(canPlayerAct(state, 'p2', { type: 'ACK_BIDS' })).toBe(true)
  })

  it('allows simultaneous assignment online', () => {
    const state = {
      ...initialState(),
      playMode: 'online' as const,
      phase: 'assignment' as const,
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
      assignmentDone: {},
      players: [dummyPlayer({ id: 'p1' }), dummyPlayer({ id: 'p2', name: 'B' })],
    }
    expect(canPlayerAct(state, 'p1')).toBe(true)
    expect(canPlayerAct(state, 'p2')).toBe(true)
  })
})

describe('v2.2.1 balance', () => {
  it('removes global factory caps', () => {
    expect(RECIPES.some((r) => r.id === 'milky_almond')).toBe(true)
    expect(factoryLimit(recipeById('dark'), 4)).toBe(99)
    expect(factoryLimit(recipeById('matcha'), 4)).toBe(99)
    expect(recipeById('royal').income).toBe(10)
  })

  it('pays $4/$8/$12M to discard a pool card by stage', () => {
    expect(discardPay(1)).toBe(4)
    expect(discardPay(3)).toBe(12)
    const card = { uid: 'x', kind: 'ingredient' as const, name: 'Sugar', cost: 1, stage: 1 as const, family: 'sugar' as const }
    let state: GameState = {
      ...initialState(),
      playerCount: 2,
      players: [dummyPlayer({ cash: 4 }), dummyPlayer({ id: 'p2', name: 'B' })],
      phase: 'purchase',
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
      pool: [card],
    }
    state = reduce(state, { type: 'DISCARD_POOL', cardUid: 'x' })
    expect(state.players[0].cash).toBe(8)
    expect(state.publicDiscard[0].uid).toBe('x')
  })

  it('draws three schemes and keeps one when the deck has at least three', () => {
    const player = dummyPlayer({ assignedRepP: 5 })
    let state: GameState = {
      ...initialState(),
      playerCount: 2,
      players: [player, dummyPlayer({ id: 'p2', name: 'B' })],
      phase: 'scheme',
      turnOrder: ['p1', 'p2'],
      actorIndex: 0,
      schemeDeck: [
        { uid: 's1', schemeId: 'press_leak', name: 'Press Leak' },
        { uid: 's2', schemeId: 'black_market', name: 'Black Market' },
        { uid: 's3', schemeId: 'hostile_takeover', name: 'Hostile Takeover' },
        { uid: 's4', schemeId: 'money_laundering', name: 'Money Laundering' },
      ],
    }
    expect(canDrawScheme(state, player)).toBe(true)
    state = reduce(state, { type: 'DRAW_SCHEME' })
    expect(state.schemeDraft).toHaveLength(3)
    expect(state.players[0].schemes).toHaveLength(0)
    expect(state.players[0].spentRep).toBe(1)
    const keep = state.schemeDraft![0]
    state = reduce(state, { type: 'KEEP_SCHEME', cardUid: keep.uid })
    expect(state.schemeDraft).toBeNull()
    expect(state.players[0].schemes).toEqual([keep])
    expect(state.schemeDeck).toHaveLength(3)
  })

  it('cannot draw schemes if fewer than three remain', () => {
    const player = dummyPlayer({ assignedRepP: 5 })
    const state: GameState = {
      ...initialState(),
      playerCount: 2,
      players: [player],
      phase: 'scheme',
      turnOrder: ['p1'],
      actorIndex: 0,
      schemeDeck: [
        { uid: 's1', schemeId: 'press_leak', name: 'Press Leak' },
        { uid: 's2', schemeId: 'black_market', name: 'Black Market' },
      ],
    }
    expect(canDrawScheme(state, player)).toBe(false)
    expect(reduce(state, { type: 'DRAW_SCHEME' }).schemeDraft).toBeNull()
  })

  it('gives tied standings the worse shared relief rank', () => {
    const a = dummyPlayer({ id: 'p1', name: 'A', cash: 100, lastIncome: 10 })
    const b = dummyPlayer({ id: 'p2', name: 'B', cash: 20 })
    const c = dummyPlayer({ id: 'p3', name: 'C', cash: 20 })
    const state = {
      ...initialState(),
      playerCount: 3,
      players: [a, b, c],
    } as GameState
    const ranks = reliefRanks(state)
    expect(ranks.p1).toBe(1)
    expect(ranks.p2).toBe(3)
    expect(ranks.p3).toBe(3)
    expect(reliefAllowance(1)).toBe(0)
    expect(reliefAllowance(3)).toBe(1)
    expect(reliefAllowance(5)).toBe(1)
  })

  it('reveals other hands to a Double Agent holder during the scheme phase', () => {
    const me = dummyPlayer({
      id: 'p1',
      schemes: [{ uid: 's1', schemeId: 'double_agent', name: 'Double Agent' }],
    })
    const them = dummyPlayer({
      id: 'p2',
      name: 'B',
      hand: [{ uid: 'h2', kind: 'ingredient', name: 'Matcha', cost: 8, stage: 1, family: 'matcha' }],
    })
    const state = {
      ...initialState(),
      playMode: 'online' as const,
      phase: 'scheme' as const,
      players: [me, them],
    }
    const view = filterStateForPlayer(state, 'p1')
    expect(view.players[1].hand[0].name).toBe('Matcha')
  })
})

describe('Embezzlement and Press Leak', () => {
  const basicFactory = {
    id: 'f1',
    extraSlots: 0,
    hazardousSlots: 0,
    ingredients: [],
    recipeId: 'basic' as const,
  }

  it('keeps Labour Exploitation as a personal double then shutdown', () => {
    const a = dummyPlayer({ factories: [basicFactory] })
    const b = dummyPlayer({
      id: 'p2',
      name: 'B',
      factories: [{ ...basicFactory, id: 'f2' }],
    })
    const boom = {
      ...initialState(),
      players: [a, b],
      effects: [{ kind: 'labour' as const, playerId: 'p1', remaining: 2 }],
    }
    expect(playerFactoryIncome(boom, a)).toBe(2)
    expect(playerFactoryIncome(boom, b)).toBe(1)
    const crash = {
      ...boom,
      effects: [{ kind: 'labour' as const, playerId: 'p1', remaining: 1 }],
    }
    expect(playerFactoryIncome(crash, a)).toBe(0)
    expect(playerFactoryIncome(crash, b)).toBe(1)
  })

  it('ships Press Leak and Embezzlement instead of Overworked and Class Revolution', () => {
    expect(SCHEME_INFO.press_leak.name).toBe('Press Leak')
    expect(SCHEME_INFO.embezzlement.name).toBe('Embezzlement')
    expect((SCHEME_INFO as Record<string, unknown>).overworked).toBeUndefined()
    expect((SCHEME_INFO as Record<string, unknown>).class_revolution).toBeUndefined()
    expect(schemePlayCost('black_market', 4, 2)).toBe(3)
    expect(schemePlayCost('double_agent', 4, 1)).toBe(2)
  })

  it('requires exactly two Press Leak targets and works when they have no Schemes', () => {
    const caster = dummyPlayer({ assignedRepP: 4 })
    const b = dummyPlayer({ id: 'p2', name: 'B', schemes: [] })
    const c = dummyPlayer({
      id: 'p3',
      name: 'C',
      schemes: [
        { uid: 'c1', schemeId: 'money_laundering', name: 'Money Laundering' },
        { uid: 'c2', schemeId: 'hostile_takeover', name: 'Hostile Takeover' },
      ],
    })
    const d = dummyPlayer({ id: 'p4', name: 'D', schemes: [] })
    const pending = {
      playerId: 'p1',
      cardUid: 'pl',
      schemeId: 'press_leak' as const,
      name: 'Press Leak',
      playCost: 2,
      targets: {},
      awaitingTargets: true,
    }
    const base = {
      ...initialState(),
      playerCount: 4,
      players: [caster, b, c, d],
      phase: 'scheme' as const,
      turnOrder: ['p1', 'p2', 'p3', 'p4'],
      actorIndex: 0,
      pendingScheme: pending,
    }
    const oneTarget = reduce(base, {
      type: 'CONFIRM_SCHEME_TARGETS',
      targets: { opponentId: 'p2' },
    })
    expect(oneTarget.pendingScheme?.awaitingTargets).toBe(true)

    const ok = reduce(base, {
      type: 'CONFIRM_SCHEME_TARGETS',
      targets: { opponentId: 'p2', opponentId2: 'p3', theirCardUid2: 'c1' },
    })
    expect(ok.pendingScheme).toBeNull()
    expect(ok.players[1].schemes).toHaveLength(0)
    expect(ok.players[2].schemes.map((s) => s.uid)).toEqual(['c2'])
    expect(ok.schemeDiscard.some((s) => s.uid === 'c1')).toBe(true)
    expect(ok.log.some((e) => e.text.includes("looks at B's Schemes"))).toBe(true)
    expect(ok.log.some((e) => e.text.includes("looks at C's Schemes"))).toBe(true)
  })

  it('lets Embezzlement take all cash when an opponent cannot pay in full', () => {
    const caster = dummyPlayer({
      assignedRepP: 4,
      cash: 10,
      schemes: [{ uid: 'emb', schemeId: 'embezzlement', name: 'Embezzlement' }],
    })
    const b = dummyPlayer({ id: 'p2', name: 'B', cash: 2 })
    const c = dummyPlayer({ id: 'p3', name: 'C', cash: 20 })
    let state = {
      ...initialState(),
      playerCount: 3,
      stage: 1,
      players: [caster, b, c],
      phase: 'scheme' as const,
      turnOrder: ['p1', 'p2', 'p3'],
      actorIndex: 0,
    } as GameState
    state = reduce(state, { type: 'PLAY_SCHEME', cardUid: 'emb', targets: {} })
    state = reduce(state, { type: 'DECLINE_VETO' })
    state = reduce(state, { type: 'DECLINE_VETO' })
    expect(state.pendingScheme).toBeNull()
    expect(state.players[1].cash).toBe(0)
    expect(state.players[2].cash).toBe(17)
    expect(state.players[0].cash).toBe(15)
  })
})

describe('scheme veto before targets', () => {
  it('commits the card through veto before targets and keeps the name out of the ledger', () => {
    const caster = dummyPlayer({
      assignedRepP: 5,
      schemes: [{ uid: 'da', schemeId: 'double_agent', name: 'Double Agent' }],
      hand: [
        { uid: 'h1', kind: 'ingredient', name: 'Sugar', cost: 1, stage: 1, family: 'sugar' },
        { uid: 'h2', kind: 'ingredient', name: 'Milk', cost: 3, stage: 1, family: 'milk' },
      ],
    })
    const b = dummyPlayer({
      id: 'p2',
      name: 'B',
      hand: [{ uid: 'b1', kind: 'ingredient', name: 'Matcha', cost: 12, stage: 1, family: 'matcha' }],
    })
    const c = dummyPlayer({
      id: 'p3',
      name: 'C',
      hand: [{ uid: 'c1', kind: 'ingredient', name: 'Cocoa', cost: 1, stage: 1, family: 'cocoa' }],
    })
    let state = {
      ...initialState(),
      playerCount: 3,
      players: [caster, b, c],
      playMode: 'online',
      phase: 'scheme',
      turnOrder: ['p1', 'p2', 'p3'],
      actorIndex: 0,
    } as GameState
    state = reduce(state, {
      type: 'PLAY_SCHEME',
      cardUid: 'da',
      targets: {
        opponentId: 'p2',
        opponentId2: 'p3',
        ownCardUid: 'h1',
        ownCardUid2: 'h2',
        theirCardUid: 'b1',
        theirCardUid2: 'c1',
      },
    })
    expect(state.pendingScheme?.awaitingTargets).toBe(false)
    expect(state.pendingScheme?.targets).toEqual({})
    expect(state.players[0].hand.map((card) => card.uid)).toEqual(['h1', 'h2'])
    state = reduce(state, { type: 'DECLINE_VETO' })
    state = reduce(state, { type: 'DECLINE_VETO' })
    expect(state.pendingScheme?.awaitingTargets).toBe(true)
    expect(state.players[0].schemes).toHaveLength(0)
    expect(state.log.some((entry) => entry.text.includes('Double Agent'))).toBe(false)
    expect(state.log.some((entry) => entry.text.includes('plays a Scheme'))).toBe(true)
    state = reduce(state, {
      type: 'CONFIRM_SCHEME_TARGETS',
      targets: {
        opponentId: 'p2',
        opponentId2: 'p3',
        ownCardUid: 'h1',
        ownCardUid2: 'h2',
        theirCardUid: 'b1',
        theirCardUid2: 'c1',
      },
    })
    expect(state.pendingScheme).toBeNull()
    expect(state.players[0].hand.some((card) => card.uid === 'b1')).toBe(true)
    expect(state.log.some((entry) => entry.text.includes('Double Agent'))).toBe(false)
  })

  it('can skip target selection after a Scheme is already committed', () => {
    const caster = dummyPlayer({
      schemes: [{ uid: 'pg', schemeId: 'price_gouging', name: 'Price Gouging' }],
      assignedRepP: 4,
    })
    const other = dummyPlayer({ id: 'p2', name: 'B' })
    const third = dummyPlayer({ id: 'p3', name: 'C' })
    let state = {
      ...initialState(),
      playerCount: 3,
      players: [caster, other, third],
      phase: 'scheme' as const,
      turnOrder: ['p1', 'p2', 'p3'],
      actorIndex: 0,
      pendingScheme: {
        playerId: 'p1',
        cardUid: 'pg',
        schemeId: 'price_gouging' as const,
        name: 'Price Gouging',
        playCost: 1,
        targets: {},
        awaitingTargets: true,
      },
    } as GameState
    state = reduce(state, { type: 'SKIP_SCHEME' })
    expect(state.pendingScheme).toBeNull()
    expect(state.phase).toBe('scheme')
  })

  it('copies a family the opponent actually owns for Synthetic Ingredient', () => {
    const caster = dummyPlayer({ assignedRepP: 6 })
    const other = dummyPlayer({
      id: 'p2',
      name: 'B',
      supply: [{ uid: 'm1', kind: 'ingredient', name: 'Matcha', cost: 12, stage: 1, family: 'matcha' }],
    })
    const third = dummyPlayer({ id: 'p3', name: 'C' })
    const pending = {
      playerId: 'p1',
      cardUid: 'syn',
      schemeId: 'synthetic_ingredient' as const,
      name: 'Synthetic Ingredient',
      playCost: 1,
      targets: {},
      awaitingTargets: true,
    }
    const base = {
      ...initialState(),
      playerCount: 3,
      players: [caster, other, third],
      phase: 'scheme' as const,
      turnOrder: ['p1', 'p2', 'p3'],
      actorIndex: 0,
      pendingScheme: pending,
    }
    const rejected = reduce(base, {
      type: 'CONFIRM_SCHEME_TARGETS',
      targets: { opponentId: 'p2', family: 'royal_honey' },
    })
    expect(rejected.pendingScheme?.awaitingTargets).toBe(true)
    expect(rejected.players[0].supply).toHaveLength(0)

    const ok = reduce(base, {
      type: 'CONFIRM_SCHEME_TARGETS',
      targets: { opponentId: 'p2', family: 'matcha' },
    })
    expect(ok.pendingScheme).toBeNull()
    expect(ok.players[0].supply.some((c) => c.family === 'matcha' && c.synthetic)).toBe(true)
  })
})

describe('smoke', () => {
  it('can start a 4-bot game and play several actions', () => {
    resetUid()
    let state = initialState()
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
    expect(state.players).toHaveLength(4)
    expect(state.phase === 'setup').toBe(false)
    expect(state.players.every((p) => p.hand.length === 9 || p.hand.length < 9)).toBe(true)
  })
})
