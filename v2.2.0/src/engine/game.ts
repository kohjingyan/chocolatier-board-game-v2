import {
  ALL_MASTERY_IDS,
  buildSchemeDeck,
  buildStageDeck,
  discardPay,
  emptyBreakdown,
  masteryCard,
  openMarketCard,
  openMarketPay,
  recipeById,
  RELIEF_CASH,
  RELIEF_PENALTY,
  RELIEF_REP,
  RELIEF_RES,
  REP_FACTORY_COST,
  REP_JUNIOR_COST,
  REP_SENIOR_COST,
  REP_SLOT_L1_COST,
  REP_SLOT_L2_COST,
  resetUid,
  SCHEME_INFO,
  schemePlayCost,
  startingSupply,
  syntheticCopy,
} from './data'
import { cleanProduction, playerIncome } from './income'
import { reliefAllowance, reliefRanks, reliefStage } from './relief'
import {
  buildableOnFactory,
  canAssignRecipe,
  canObtain,
  currentActor,
  currentVetoId,
  factoryCapacity,
  faceCost,
  finalScores,
  mostReputableId,
  naturalMostReputableId,
  ownsFamily,
  playerById,
  recipeRepAward,
  poolPrice,
  repLevel,
  repP,
  resLevel,
  resP,
} from './queries'
import { nextRand, roll2d6, shuffle } from './rng'
import type {
  Action,
  GameCard,
  GameState,
  Phase,
  Player,
  ReliefKind,
  SchemeTargets,
  SetupConfig,
} from './types'

export function initialState(): GameState {
  return {
    playerCount: 0,
    players: [],
    phase: 'setup',
    stage: 1,
    round: 1,
    turnOrder: [],
    actorIndex: 0,
    curtainPlayerId: null,
    resumePhase: null,
    bids: {},
    tieIds: [],
    dice: {},
    pool: [],
    contributed: {},
    publicDiscard: [],
    leftoverDiscard: [],
    schemeDeck: [],
    schemeDiscard: [],
    openCocoa: 0,
    openSugar: 0,
    masteryMarket: [],
    effects: [],
    pendingScheme: null,
    vetoIndex: 0,
    pvQueue: [],
    pvPassed: [],
    firstIntroducedBy: {},
    mostReputableId: null,
    log: [],
    logSeq: 0,
    incomePreview: null,
    bidRound: 'main',
    dicePrefix: [],
    diceSuffix: [],
    diceBlock: [],
    stageDeck: [],
    incomeOverrides: {},
    costOverrides: {},
    seed: Date.now() % 1_000_000_007,
    playMode: 'hotseat',
    schemeDraft: null,
    reliefRanks: {},
    reliefMax: {},
    reliefPicks: {},
    reliefQueue: [],
    reliefIndex: 0,
    assignmentDone: {},
  }
}

function log(state: GameState, text: string) {
  state.logSeq += 1
  state.log.push({ id: state.logSeq, text })
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80)
}

function refreshTitle(state: GameState) {
  const next = naturalMostReputableId(state)
  if (next !== state.mostReputableId) {
    state.mostReputableId = next
    if (next) {
      log(state, `${playerById(state, next).name} is Most Reputable.`)
    } else {
      log(state, 'Most Reputable is vacant.')
    }
  }
}

function pay(player: Player, amount: number): number {
  const paid = Math.min(player.cash, Math.max(0, amount))
  player.cash -= paid
  return paid
}

function maybeCurtain(state: GameState, playerId: string, phase: Phase) {
  const p = playerById(state, playerId)
  if (p.isBot || state.playMode === 'online') {
    state.curtainPlayerId = null
    state.resumePhase = null
    state.phase = phase
    return
  }
  state.curtainPlayerId = playerId
  state.resumePhase = phase
  state.phase = 'curtain'
}

function showPhase(state: GameState, phase: Phase, actorId?: string) {
  if (actorId) {
    const idx = state.turnOrder.indexOf(actorId)
    if (idx >= 0) state.actorIndex = idx
    maybeCurtain(state, actorId, phase)
    return
  }
  state.phase = phase
}

function showSharedPhase(state: GameState, phase: Phase) {
  state.curtainPlayerId = null
  state.resumePhase = null
  state.phase = phase
}

function isAsyncPhase(phase: Phase): boolean {
  return (
    phase === 'bid' ||
    phase === 'bid_tie' ||
    phase === 'contribute' ||
    phase === 'private_viewing' ||
    phase === 'assignment' ||
    phase === 'relief'
  )
}

function playerNeedsAction(state: GameState, playerId: string): boolean {
  if (state.phase === 'bid' || state.phase === 'bid_tie') {
    const ids = state.phase === 'bid_tie' ? state.tieIds : state.players.map((p) => p.id)
    return ids.includes(playerId) && state.bids[playerId] === undefined
  }
  if (state.phase === 'contribute') return !state.contributed[playerId]
  if (state.phase === 'private_viewing') {
    return !state.pvQueue.includes(playerId) && !state.pvPassed.includes(playerId)
  }
  if (state.phase === 'relief') {
    return (state.reliefPicks[playerId]?.length ?? 0) < (state.reliefMax[playerId] ?? 0)
  }
  if (state.phase === 'assignment') return !state.assignmentDone[playerId]
  return false
}

function resolveActor(state: GameState, action: Action, fallbackId?: string | null): Player {
  if (action.actorId && state.players.some((p) => p.id === action.actorId)) {
    return playerById(state, action.actorId)
  }
  if (fallbackId) return playerById(state, fallbackId)
  return currentActor(state)
}

function firstUnfinished(state: GameState, done: (p: Player) => boolean): Player | null {
  for (const id of state.turnOrder) {
    const p = playerById(state, id)
    if (!done(p)) return p
  }
  return null
}

function takeCard(list: GameCard[], uid: string): GameCard {
  const i = list.findIndex((c) => c.uid === uid)
  if (i < 0) throw new Error('Card not found')
  return list.splice(i, 1)[0]
}

function beginStage(state: GameState) {
  const deck = shuffle(buildStageDeck(state.stage, state.playerCount), state)
  for (const p of state.players) {
    p.hand = []
    p.schemePlayedThisRound = false
  }
  for (const p of state.players) p.hand = deck.splice(0, 9)
  state.stageDeck = deck
  log(state, `Stage ${state.stage} — 9 cards dealt to each player. Bid for turn order.`)
  if (state.stage === 1) {
    state.openCocoa += 2 * state.playerCount
    state.openSugar += 2 * state.playerCount
  } else {
    state.openCocoa += state.playerCount
    state.openSugar += state.playerCount
  }
  state.bids = {}
  state.tieIds = []
  state.dice = {}
  state.dicePrefix = []
  state.diceSuffix = []
  state.diceBlock = []
  state.bidRound = 'main'
  state.pool = []
  state.contributed = {}
  const first = state.players[0]
  state.turnOrder = state.players.map((p) => p.id)
  stampCardCosts(state)
  if (state.playMode === 'online') showSharedPhase(state, 'bid')
  else showPhase(state, 'bid', first.id)
}

function stampCardCosts(state: GameState) {
  const visit = (card: GameCard) => {
    card.cost = faceCost(state, card)
  }
  for (const p of state.players) {
    for (const card of [...p.hand, ...p.supply, ...p.factories.flatMap((f) => f.ingredients)]) visit(card)
  }
  for (const card of [
    ...state.pool,
    ...state.publicDiscard,
    ...state.leftoverDiscard,
    ...state.stageDeck,
    ...state.masteryMarket,
  ]) {
    visit(card)
  }
}

function startGame(state: GameState, config: SetupConfig) {
  resetUid()
  const seats = config.seats
  if (seats.length < 3 || seats.length > 4) {
    log(state, 'This edition is for 3 or 4 chocolatiers.')
    return
  }
  state.playerCount = seats.length
  state.players = seats.map((seat, i) => ({
    id: `p${i + 1}`,
    name: seat.name.trim() || `Player ${i + 1}`,
    isBot: seat.isBot,
    cash: 20,
    hand: [],
    schemes: [],
    supply: startingSupply(),
    factories: [1, 2, 3, 4].map((n) => ({
      id: `p${i + 1}-f${n}`,
      extraSlots: 0,
      hazardousSlots: 0,
      ingredients: [],
      recipeId: null,
    })),
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
    lastBreakdown: emptyBreakdown(),
  }))
  state.schemeDeck = shuffle(buildSchemeDeck(), state)
  state.schemeDiscard = []
  state.masteryMarket = shuffle([...ALL_MASTERY_IDS], state)
    .slice(0, seats.length)
    .map((id) => masteryCard(id))
  state.stage = 1
  state.round = 1
  state.effects = []
  state.firstIntroducedBy = {}
  state.mostReputableId = null
  state.publicDiscard = []
  state.leftoverDiscard = []
  state.pvQueue = []
  state.pvPassed = []
  const overrides = { ...state.incomeOverrides }
  state.incomeOverrides = overrides
  state.costOverrides = { ...state.costOverrides }
  state.playMode = config.playMode ?? state.playMode ?? 'hotseat'
  log(
    state,
    `A new atelier opens with ${seats.length} chocolatiers${state.playMode === 'online' ? ' (online)' : ''}. Masteries on offer: ${state.masteryMarket.map((c) => c.name).join(', ')}.`,
  )
  beginStage(state)
}

function resolveBids(state: GameState, ids: string[], amounts: Record<string, number>) {
  const groups = new Map<number, string[]>()
  for (const id of ids) {
    const amt = amounts[id] ?? 0
    const list = groups.get(amt) ?? []
    list.push(id)
    groups.set(amt, list)
  }
  const sortedAmts = [...groups.keys()].sort((a, b) => b - a)
  const order: string[] = []
  const unresolved: string[] = []
  for (const amt of sortedAmts) {
    const group = groups.get(amt) ?? []
    if (group.length === 1) {
      order.push(group[0])
      continue
    }
    const byRep = [...group].sort((a, b) => repP(playerById(state, b)) - repP(playerById(state, a)))
    let i = 0
    while (i < byRep.length) {
      const r = repP(playerById(state, byRep[i]))
      const tied = byRep.filter((id) => repP(playerById(state, id)) === r)
      if (byRep[i] !== tied[0]) {
        i += 1
        continue
      }
      if (tied.length === 1) {
        order.push(tied[0])
      } else {
        unresolved.push(...tied)
        order.push(...tied)
      }
      i += tied.length
    }
  }
  return { order, unresolved }
}

function applyTurnOrder(state: GameState, order: string[]) {
  state.turnOrder = order
  log(
    state,
    `Turn order: ${order.map((id, i) => `${i + 1}. ${playerById(state, id).name}`).join(' · ')}`,
  )
  beginContribute(state)
}

function finishMainBids(state: GameState) {
  const ids = state.players.map((p) => p.id)
  const { order, unresolved } = resolveBids(state, ids, state.bids)
  if (unresolved.length > 0) {
    state.tieIds = unresolved
    state.turnOrder = order
    log(state, `Tied bid + reputation: ${unresolved.map((id) => playerById(state, id).name).join(', ')} re-bid.`)
    for (const id of unresolved) delete state.bids[id]
    state.bidRound = 'tie'
    showPhase(state, 'bid_tie', unresolved[0])
    return
  }
  applyTurnOrder(state, order)
}

function finishTieBids(state: GameState) {
  const tieBids: Record<string, number> = {}
  for (const id of state.tieIds) tieBids[id] = state.bids[id] ?? 0
  const { order: inner, unresolved } = resolveBids(state, state.tieIds, tieBids)
  const merged: string[] = []
  const used = new Set<string>()
  for (const id of state.turnOrder) {
    if (state.tieIds.includes(id)) {
      if (!used.has(state.tieIds[0])) {
        merged.push(...inner)
        for (const t of state.tieIds) used.add(t)
      }
    } else {
      merged.push(id)
    }
  }
  if (unresolved.length > 0) {
    state.tieIds = unresolved
    state.turnOrder = merged
    state.dice = {}
    state.dicePrefix = []
    state.diceSuffix = []
    state.diceBlock = [...unresolved]
    log(state, `Still tied. Rolling dice for ${unresolved.map((id) => playerById(state, id).name).join(', ')}.`)
    state.phase = 'dice_tie'
    return
  }
  applyTurnOrder(state, merged)
}

function partitionDice(ids: string[], scores: Record<string, number>) {
  const groups = new Map<number, string[]>()
  for (const id of ids) {
    const score = scores[id] ?? 0
    const list = groups.get(score) ?? []
    list.push(id)
    groups.set(score, list)
  }
  const prefix: string[] = []
  let pending: string[] = []
  const suffix: string[] = []
  for (const score of [...groups.keys()].sort((a, b) => b - a)) {
    const group = groups.get(score) ?? []
    if (pending.length > 0) suffix.push(...group)
    else if (group.length === 1) prefix.push(group[0])
    else pending = group
  }
  return { prefix, pending, suffix }
}

function replaceBlock(order: string[], block: string[], replacement: string[]) {
  const start = order.findIndex((id) => block.includes(id))
  const without = order.filter((id) => !block.includes(id))
  without.splice(start < 0 ? without.length : start, 0, ...replacement)
  return without
}

export function partitionDiceTies(ids: string[], scores: Record<string, number>) {
  return partitionDice(ids, scores)
}

function finishDice(state: GameState) {
  const { prefix, pending, suffix } = partitionDice(state.tieIds, state.dice)
  state.dicePrefix = [...state.dicePrefix, ...prefix]
  if (pending.length > 0) {
    const held = [...suffix, ...state.diceSuffix]
    state.diceSuffix = held
    const lockedLow = held.map((id) => playerById(state, id).name).join(', ')
    log(
      state,
      `${pending.map((id) => playerById(state, id).name).join(', ')} remain tied and reroll.` +
        (lockedLow ? ` ${lockedLow} locked lower.` : ''),
    )
    for (const id of pending) delete state.dice[id]
    state.tieIds = pending
    return
  }
  const rest = [...suffix, ...state.diceSuffix]
  state.diceSuffix = []
  if (rest.length > 0) {
    state.tieIds = rest
    finishDice(state)
    return
  }
  const block = [...state.dicePrefix]
  const merged = replaceBlock(state.turnOrder, state.diceBlock.length ? state.diceBlock : block, block)
  applyTurnOrder(state, merged)
}

function beginContribute(state: GameState) {
  state.contributed = {}
  state.pool = []
  state.pvQueue = []
  state.pvPassed = []
  for (const p of state.players) p.schemePlayedThisRound = false
  const first = firstUnfinished(state, (p) => Boolean(state.contributed[p.id]))
  if (!first) {
    revealPool(state)
    return
  }
  if (state.playMode === 'online') {
    showSharedPhase(state, 'contribute')
    return
  }
  showPhase(state, 'contribute', first.id)
}

function revealPool(state: GameState) {
  const cards: GameCard[] = []
  for (const id of state.turnOrder) {
    const p = playerById(state, id)
    const uid = state.contributed[id]
    const card = takeCard(p.hand, uid)
    cards.push(card)
  }
  state.pool = shuffle(cards, state)
  log(state, `Market revealed: ${state.pool.map((c) => c.name).join(', ')}.`)
  beginPrivateViewing(state)
}

function canPlayPrivateViewing(player: Player, state: GameState): boolean {
  return Boolean(
    !player.schemePlayedThisRound &&
      repP(player) >= schemePlayCost('private_viewing', state.playerCount, state.stage) &&
      player.schemes.some((c) => c.schemeId === 'private_viewing'),
  )
}

function firstPvActor(state: GameState): string | null {
  for (const id of state.turnOrder) {
    if (state.pvQueue.includes(id) || state.pvPassed.includes(id)) continue
    return id
  }
  return null
}

function beginPrivateViewing(state: GameState) {
  state.pvQueue = []
  state.pvPassed = []
  for (const p of state.players) {
    if (p.isBot || !canPlayPrivateViewing(p, state)) state.pvPassed.push(p.id)
  }
  if (finishPrivateViewingIfReady(state)) return
  const first = firstPvActor(state)
  if (!first) {
    beginPurchase(state)
    return
  }
  if (state.playMode === 'online') {
    showSharedPhase(state, 'private_viewing')
    return
  }
  showPhase(state, 'private_viewing', first)
}

function finishPrivateViewingIfReady(state: GameState): boolean {
  if (state.players.some((p) => !state.pvQueue.includes(p.id) && !state.pvPassed.includes(p.id))) {
    return false
  }
  const cutters = state.turnOrder.filter((id) => state.pvQueue.includes(id))
  const rest = state.turnOrder.filter((id) => !state.pvQueue.includes(id))
  if (cutters.length > 0) {
    state.turnOrder = [...cutters, ...rest]
    log(
      state,
      `Private Viewing order: ${cutters.map((id) => playerById(state, id).name).join(', then ')}.`,
    )
  }
  beginPurchase(state)
  return true
}

function beginPurchase(state: GameState) {
  showPhase(state, 'purchase', state.turnOrder[0])
}

function nextPurchase(state: GameState) {
  if (state.actorIndex >= state.turnOrder.length - 1 || state.pool.length === 0) {
    beginScheme(state)
    return
  }
  showPhase(state, 'purchase', state.turnOrder[state.actorIndex + 1])
}

function beginScheme(state: GameState) {
  showPhase(state, 'scheme', state.turnOrder[0])
}

function nextScheme(state: GameState) {
  if (state.actorIndex >= state.turnOrder.length - 1) {
    beginAssignment(state)
    return
  }
  showPhase(state, 'scheme', state.turnOrder[state.actorIndex + 1])
}

function beginAssignment(state: GameState) {
  state.assignmentDone = {}
  if (state.playMode === 'online') {
    showSharedPhase(state, 'assignment')
    return
  }
  showPhase(state, 'assignment', state.turnOrder[0])
}

function nextAssignment(state: GameState) {
  const nxt = firstUnfinished(state, (p) => Boolean(state.assignmentDone[p.id]))
  if (!nxt) {
    awardAllRecipeRep(state)
    runIncome(state)
    return
  }
  if (state.playMode === 'online') {
    showSharedPhase(state, 'assignment')
    return
  }
  showPhase(state, 'assignment', nxt.id)
}

function obtainMastery(state: GameState, player: Player, card: GameCard) {
  const incoming = card.masteryId
  if (!incoming) {
    player.supply.push(card)
    return
  }
  if (player.mastery) {
    state.publicDiscard.push(card)
    log(state, `${player.name} already holds a Mastery and cannot take ${card.name}.`)
    return
  }
  player.mastery = incoming
  log(state, `${player.name} puts ${card.name} into play.`)
}

function giveCard(state: GameState, player: Player, card: GameCard) {
  if (card.kind === 'mastery') {
    obtainMastery(state, player, card)
    return
  }
  player.supply.push(card)
}

function beginVeto(state: GameState, player: Player, cardUid: string, schemeId: typeof state.pendingScheme extends infer _ ? NonNullable<GameState['pendingScheme']>['schemeId'] : never, targets: SchemeTargets) {
  const playCost = schemePlayCost(schemeId, state.playerCount, state.stage)
  state.pendingScheme = {
    playerId: player.id,
    cardUid,
    schemeId,
    name: SCHEME_INFO[schemeId].name,
    playCost,
    targets,
    awaitingTargets: false,
  }
  state.vetoIndex = 0
  const first = currentVetoId(state)
  if (!first) {
    resolvePendingScheme(state)
    return
  }
  const prev = state.resumePhase ?? state.phase
  state.resumePhase = prev === 'curtain' ? 'scheme' : prev
  maybeCurtain(state, first, state.resumePhase)
}

function resolvePendingScheme(state: GameState) {
  const pending = state.pendingScheme
  if (!pending) return
  const player = playerById(state, pending.playerId)
  const card = player.schemes.find((c) => c.uid === pending.cardUid)
  if (!card) {
    state.pendingScheme = null
    return
  }
  if (repP(player) < pending.playCost) {
    log(state, `${player.name} cannot afford that Scheme.`)
    state.pendingScheme = null
    return
  }
  player.spentRep += pending.playCost
  player.schemes = player.schemes.filter((c) => c.uid !== pending.cardUid)
  state.schemeDiscard.push(card)
  if (pending.schemeId !== 'veto_power' && pending.schemeId !== 'private_viewing') {
    player.schemePlayedThisRound = true
  }
  if (pending.schemeId === 'private_viewing') {
    player.schemePlayedThisRound = true
  }
  log(state, `${player.name} plays a Scheme.`)
  if (pending.schemeId !== 'private_viewing') {
    state.phase = 'scheme'
    state.curtainPlayerId = null
    const idx = state.turnOrder.indexOf(player.id)
    if (idx >= 0) state.actorIndex = idx
  }
  if (schemeNeedsTargets(pending.schemeId)) {
    if (!canChooseSchemeTargets(state, player, pending.schemeId)) {
      log(state, `${player.name}'s Scheme has no effect.`)
      state.pendingScheme = null
      refreshTitle(state)
      return
    }
    state.pendingScheme = { ...pending, targets: {}, awaitingTargets: true }
    return
  }
  applyScheme(state, player, pending.schemeId, pending.targets)
  state.pendingScheme = null
  refreshTitle(state)
}

function tearDown(state: GameState, player: Player, factoryId: string) {
  const factory = player.factories.find((f) => f.id === factoryId)
  if (!factory) return
  player.supply.push(...factory.ingredients)
  factory.ingredients = []
  if (factory.recipeId) {
    log(state, `${player.name} tears down ${factory.recipeId}.`)
  }
  factory.recipeId = null
}

function applyScheme(state: GameState, player: Player, schemeId: NonNullable<GameState['pendingScheme']>['schemeId'], targets: SchemeTargets) {
  if (schemeId === 'forced_swap') {
    const opp = playerById(state, targets.opponentId ?? '')
    const mine = takeCard(player.supply, targets.ownCardUid ?? '')
    const theirs = takeCard(opp.supply, targets.theirCardUid ?? '')
    if (faceCost(state, mine) > faceCost(state, theirs)) {
      const paid = pay(player, faceCost(state, mine) - faceCost(state, theirs))
      opp.cash += paid
      log(state, `${player.name} pays ${opp.name} $${paid}M difference.`)
    }
    player.supply.push(theirs)
    opp.supply.push(mine)
    return
  }
  if (schemeId === 'private_viewing') {
    if (!state.pvQueue.includes(player.id)) state.pvQueue.push(player.id)
    log(state, `${player.name} will cut the purchase line.`)
    if (state.playMode !== 'online') {
      const next = firstPvActor(state)
      if (next) showPhase(state, 'private_viewing', next)
      else finishPrivateViewingIfReady(state)
      return
    }
    finishPrivateViewingIfReady(state)
    return
  }
  if (schemeId === 'hazardous_warehousing') {
    player.extraSlotPool += 1
    player.extraHazardPool += 1
    log(state, `${player.name} banks a hazardous extra slot.`)
    return
  }
  if (schemeId === 'black_market') {
    const card = takeCard(state.publicDiscard, targets.discardUid ?? '')
    giveCard(state, player, card)
    log(state, `${player.name} takes ${card.name} from the Discard.`)
    return
  }
  if (schemeId === 'unethical_research') {
    player.assignedResP += 1
    log(state, `${player.name} gains +1 ResP.`)
    return
  }
  if (schemeId === 'synthetic_ingredient') {
    const family = targets.family
    const opp = state.players.find((p) => p.id === targets.opponentId)
    if (!family || !opp || !ownsFamily(opp, family)) return
    player.supply.push(syntheticCopy(family))
    log(state, `${player.name} copies ${opp.name}'s ${family.replace('_', ' ')}.`)
    return
  }
  if (schemeId === 'unlicensed_chef') {
    if (targets.recipeId && !player.unlicensedRecipes.includes(targets.recipeId)) {
      player.unlicensedRecipes.push(targets.recipeId)
    }
    return
  }
  if (schemeId === 'labour_exploitation') {
    state.effects.push({ kind: 'labour', playerId: player.id, remaining: 2 })
    return
  }
  if (schemeId === 'artificial_shortage') {
    const family = targets.family
    if (!family) return
    for (const p of state.players) {
      const hit = p.supply.find((c) => c.family === family)
      if (hit) {
        p.supply = p.supply.filter((c) => c.uid !== hit.uid)
        log(state, `${p.name} loses ${hit.name} from Supply.`)
      }
    }
    return
  }
  if (schemeId === 'price_gouging') {
    if (targets.family && targets.family !== 'cocoa' && targets.family !== 'sugar') {
      state.effects.push({ kind: 'price_gouging', family: targets.family, remaining: 3 })
    }
    return
  }
  if (schemeId === 'embargo') {
    if (targets.family && targets.family !== 'cocoa' && targets.family !== 'sugar') {
      state.effects.push({ kind: 'embargo', family: targets.family, remaining: 2 })
    }
    return
  }
  if (schemeId === 'press_leak') {
    const picks = [
      { oppId: targets.opponentId, schemeUid: targets.theirCardUid },
      { oppId: targets.opponentId2, schemeUid: targets.theirCardUid2 },
    ]
    for (const pick of picks) {
      if (!pick.oppId) continue
      const opp = playerById(state, pick.oppId)
      log(state, `${player.name} looks at ${opp.name}'s Schemes.`)
      if (!pick.schemeUid || opp.schemes.length < 2) continue
      const card = opp.schemes.find((c) => c.uid === pick.schemeUid)
      if (!card) continue
      opp.schemes = opp.schemes.filter((c) => c.uid !== card.uid)
      state.schemeDiscard.push(card)
      log(state, `${player.name} discards ${opp.name}'s ${card.name}.`)
    }
    return
  }
  if (schemeId === 'embezzlement') {
    const tax = state.stage === 1 ? 3 : state.stage === 2 ? 6 : 9
    for (const opp of state.players) {
      if (opp.id === player.id) continue
      const paid = pay(opp, tax)
      player.cash += paid
      log(state, `${opp.name} pays ${player.name} $${paid}M.`)
    }
    return
  }
  if (schemeId === 'double_agent') {
    const swaps = [
      { oppId: targets.opponentId, mine: targets.ownCardUid, theirs: targets.theirCardUid },
      { oppId: targets.opponentId2, mine: targets.ownCardUid2, theirs: targets.theirCardUid2 },
    ]
    for (const swap of swaps) {
      if (!swap.oppId || !swap.mine || !swap.theirs) continue
      const opp = playerById(state, swap.oppId)
      const mine = takeCard(player.hand, swap.mine)
      const theirs = takeCard(opp.hand, swap.theirs)
      player.hand.push(theirs)
      opp.hand.push(mine)
      log(state, `${player.name} swaps a hand card with ${opp.name}.`)
    }
    return
  }
  if (schemeId === 'secret_project') {
    player.assignedResP += 2
    state.effects.push({ kind: 'secret_project', playerId: player.id, remaining: 1 })
    log(state, `${player.name} gains +2 ResP and idles factories this turn.`)
    return
  }
  if (schemeId === 'defamation_ops') {
    const titleId = mostReputableId(state)
    if (!titleId || titleId === player.id) return
    const victim = playerById(state, titleId)
    const fromTitle = Math.min(2, repP(victim))
    victim.spentRep += fromTitle
    player.earnedRecipeRep += fromTitle
    log(state, `${player.name} steals ${fromTitle} Rep from ${victim.name}.`)
    for (const other of state.players) {
      if (other.id === player.id || other.id === titleId) continue
      const stolen = Math.min(1, repP(other))
      if (stolen <= 0) continue
      other.spentRep += stolen
      player.earnedRecipeRep += stolen
      log(state, `${player.name} steals ${stolen} Rep from ${other.name}.`)
    }
    state.effects.push({ kind: 'defamation_idle', playerId: player.id, remaining: 1 })
    log(state, `${player.name}'s factories sit idle this turn.`)
    return
  }
  if (schemeId === 'hostile_takeover') {
    state.effects = state.effects.filter((e) => e.kind !== 'hostile_takeover')
    state.effects.push({ kind: 'hostile_takeover', playerId: player.id, remaining: 3 })
    log(state, `${player.name} seizes Most Reputable for 3 turns.`)
    return
  }
  if (schemeId === 'money_laundering') {
    const gain = state.stage === 1 ? 15 : state.stage === 2 ? 25 : 35
    player.cash += gain
    log(state, `${player.name} launders $${gain}M from the Bank.`)
  }
}

function runIncome(state: GameState) {
  const preview: GameState['incomePreview'] = {}
  for (const p of state.players) {
    const breakdown = playerIncome(state, p)
    p.cash += breakdown.total
    p.lastFactoryIncome = breakdown.factories
    p.lastIncome = cleanProduction(state, p)
    p.lastBreakdown = breakdown
    preview[p.id] = breakdown
    log(state, `${p.name} earns $${breakdown.total}M.`)
  }
  state.incomePreview = preview
  state.phase = 'income'
  state.curtainPlayerId = null
}

function tickEffects(state: GameState) {
  const next: GameState['effects'] = []
  for (const e of state.effects) {
    if ('remaining' in e) {
      const remaining = e.remaining - 1
      if (remaining > 0) next.push({ ...e, remaining })
      continue
    }
    next.push(e)
  }
  state.effects = next
}

function endRound(state: GameState) {
  tickEffects(state)
  const first = state.turnOrder.shift()
  if (first) state.turnOrder.push(first)
  state.round += 1
  state.incomePreview = null
  if (state.round <= 8) {
    log(state, `Stage ${state.stage}, round ${state.round}. Turn order rotates.`)
    beginContribute(state)
    return
  }
  for (const p of state.players) {
    state.publicDiscard.push(...p.hand)
    p.hand = []
  }
  state.publicDiscard.push(...state.stageDeck)
  state.stageDeck = []
  log(state, `Stage ${state.stage} leftover cards join the public Discard.`)
  if (state.stage >= 3) {
    state.phase = 'game_over'
    const scores = finalScores(state).sort((a, b) => b.total - a.total)
    log(state, `Final scores: ${scores.map((s) => `${s.name} ${s.total}`).join(' · ')}`)
    return
  }
  beginRelief(state)
}

function nextReliefGroup(state: GameState): string[] | null {
  const remaining = state.players.filter(
    (p) => (state.reliefMax[p.id] ?? 0) > 0 && !state.reliefQueue.includes(p.id),
  )
  if (remaining.length === 0) return null
  const worst = Math.max(...remaining.map((p) => state.reliefRanks[p.id] ?? 0))
  return remaining.filter((p) => state.reliefRanks[p.id] === worst).map((p) => p.id)
}

function beginRelief(state: GameState) {
  const ranks = reliefRanks(state)
  state.reliefRanks = ranks
  state.reliefMax = {}
  state.reliefPicks = {}
  state.reliefQueue = []
  state.reliefIndex = 0
  for (const p of state.players) {
    state.reliefMax[p.id] = reliefAllowance(ranks[p.id] ?? 99)
    state.reliefPicks[p.id] = []
  }
  const lines = state.players
    .map((p) => `${p.name} #${ranks[p.id]} (${standingLabel(p)})`)
    .join(' · ')
  log(state, `End of Stage ${state.stage} standings: ${lines}.`)
  enqueueReliefGroups(state)
}

function standingLabel(player: Player): string {
  return `$${player.cash}M · prod $${player.lastIncome}M · Rep ${repP(player)} · Res ${resP(player)}`
}

function enqueueReliefGroups(state: GameState) {
  const group = nextReliefGroup(state)
  if (!group) {
    startReliefPicks(state)
    return
  }
  if (group.length === 1) {
    state.reliefQueue.push(group[0])
    enqueueReliefGroups(state)
    return
  }
  state.tieIds = group
  state.dice = {}
  state.dicePrefix = []
  state.diceSuffix = []
  state.diceBlock = [...group]
  state.phase = 'relief_dice'
  state.curtainPlayerId = null
  log(state, `Relief order dice: ${group.map((id) => playerById(state, id).name).join(', ')}.`)
}

function finishReliefDice(state: GameState) {
  const { prefix, pending, suffix } = partitionDice(state.tieIds, state.dice)
  state.dicePrefix = [...state.dicePrefix, ...prefix]
  if (pending.length > 0) {
    state.diceSuffix = [...suffix, ...state.diceSuffix]
    for (const id of pending) delete state.dice[id]
    state.tieIds = pending
    log(state, `${pending.map((id) => playerById(state, id).name).join(', ')} remain tied and reroll.`)
    return
  }
  const rest = [...suffix, ...state.diceSuffix]
  state.diceSuffix = []
  if (rest.length > 0) {
    state.tieIds = rest
    finishReliefDice(state)
    return
  }
  state.reliefQueue.push(...state.dicePrefix)
  state.dicePrefix = []
  enqueueReliefGroups(state)
}

function startReliefPicks(state: GameState) {
  const first = state.reliefQueue[0]
  if (!first) {
    advanceStage(state)
    return
  }
  state.reliefIndex = 0
  if (state.playMode === 'online') {
    showSharedPhase(state, 'relief')
    return
  }
  showPhase(state, 'relief', first)
}

function reliefActor(state: GameState): Player | null {
  const id = state.reliefQueue[state.reliefIndex]
  return id ? playerById(state, id) : null
}

function nextReliefPicker(state: GameState) {
  state.reliefIndex += 1
  const nxt = state.reliefQueue[state.reliefIndex]
  if (!nxt) {
    advanceStage(state)
    return
  }
  showPhase(state, 'relief', nxt)
}

function reliefStillOpen(state: GameState): boolean {
  return state.players.some((p) => (state.reliefPicks[p.id]?.length ?? 0) < (state.reliefMax[p.id] ?? 0))
}

function continueRelief(state: GameState, playerId: string) {
  if (state.playMode === 'online') {
    if (!reliefStillOpen(state)) advanceStage(state)
    return
  }
  if ((state.reliefPicks[playerId]?.length ?? 0) >= (state.reliefMax[playerId] ?? 0)) {
    nextReliefPicker(state)
  }
}

function applyRelief(state: GameState, kind: ReliefKind, discardUid?: string, actor?: Player | null) {
  const player = actor ?? reliefActor(state)
  if (!player) return
  const taken = state.reliefPicks[player.id] ?? []
  const max = state.reliefMax[player.id] ?? 0
  if (taken.length >= max || taken.includes(kind)) return
  const stage = reliefStage(state)
  if (kind === 'res') {
    player.reliefResP = (player.reliefResP ?? 0) + RELIEF_RES[stage]
    log(state, `${player.name} takes +${RELIEF_RES[stage]} ResP relief.`)
  } else if (kind === 'rep') {
    player.reliefRepP = (player.reliefRepP ?? 0) + RELIEF_REP[stage]
    log(state, `${player.name} takes +${RELIEF_REP[stage]} Rep relief.`)
  } else if (kind === 'cash') {
    player.cash += RELIEF_CASH[stage]
    log(state, `${player.name} takes $${RELIEF_CASH[stage]}M relief.`)
  } else {
    const card = state.publicDiscard.find((c) => c.uid === discardUid && c.kind === 'ingredient')
    if (!card) return
    takeCard(state.publicDiscard, card.uid)
    player.supply.push(card)
    log(state, `${player.name} takes ${card.name} from the Discard as relief.`)
  }
  player.reliefPenalty = (player.reliefPenalty ?? 0) + RELIEF_PENALTY[stage]
  state.reliefPicks[player.id] = [...taken, kind]
  refreshTitle(state)
  continueRelief(state, player.id)
}

function advanceStage(state: GameState) {
  state.stage = (state.stage + 1) as 2 | 3
  state.round = 1
  state.schemeDraft = null
  beginStage(state)
}

function assignRecipe(state: GameState, player: Player, factoryId: string, cardUids: string[]) {
  const factory = player.factories.find((f) => f.id === factoryId)
  if (!factory) return
  const resolvedUids =
    cardUids.length > 0
      ? cardUids
      : (buildableOnFactory(state, player, factory)[0]?.cards.map((c) => c.uid) ?? [])
  if (resolvedUids.length === 0) {
    log(state, 'No valid recipe in Supply for that factory.')
    return
  }
  const cards = resolvedUids.map((id) => {
    const c = player.supply.find((x) => x.uid === id)
    if (!c) throw new Error('Missing supply card')
    return c
  })
  const check = canAssignRecipe(state, player, factory, cards)
  if (!check.ok) {
    log(state, check.reason)
    return
  }
  factory.ingredients = cards
  player.supply = player.supply.filter((c) => !resolvedUids.includes(c.uid))
  factory.recipeId = check.recipe.id
  log(state, `${player.name} assigns ${check.recipe.name}.`)
}

function awardAllRecipeRep(state: GameState) {
  type Claim = { playerId: string; recipeId: string }
  const claims: Claim[] = []
  for (const player of state.players) {
    const seen = new Set(player.completedRecipes)
    for (const factory of player.factories) {
      if (!factory.recipeId || seen.has(factory.recipeId)) continue
      seen.add(factory.recipeId)
      claims.push({ playerId: player.id, recipeId: factory.recipeId })
    }
  }
  const byRecipe = new Map<string, string[]>()
  for (const claim of claims) {
    const list = byRecipe.get(claim.recipeId) ?? []
    list.push(claim.playerId)
    byRecipe.set(claim.recipeId, list)
  }
  for (const [recipeId, playerIds] of byRecipe) {
    const recipe = recipeById(recipeId)
    const base = recipeRepAward(recipe)
    const firstUnset = !state.firstIntroducedBy[recipeId]
    const firstId = firstUnset
      ? (state.turnOrder.find((id) => playerIds.includes(id)) ?? playerIds[0])
      : state.firstIntroducedBy[recipeId]
    if (firstUnset) state.firstIntroducedBy[recipeId] = firstId
    for (const playerId of playerIds) {
      const player = playerById(state, playerId)
      player.completedRecipes.push(recipeId)
      let gained = base
      if (firstUnset && playerId === firstId && recipeId !== 'basic') gained += 1
      player.earnedRecipeRep += gained
      if (firstUnset && playerId === firstId) {
        log(
          state,
          `${player.name} introduces ${recipe.name}${gained ? ` (+${gained} Rep)` : ''}.`,
        )
      } else {
        log(state, `${player.name} completes ${recipe.name}${gained ? ` (+${gained} Rep)` : ''}.`)
      }
    }
  }
  refreshTitle(state)
}

export function reduce(state: GameState, action: Action): GameState {
  const next = JSON.parse(JSON.stringify(state)) as GameState
  try {
    apply(next, action)
  } catch (err) {
    log(next, err instanceof Error ? err.message : 'Illegal action.')
  }
  return next
}

function apply(state: GameState, action: Action) {
  if (action.type === 'NEW_GAME') {
    const overrides = state.incomeOverrides ?? {}
    const costs = state.costOverrides ?? {}
    Object.assign(state, initialState())
    state.incomeOverrides = overrides
    state.costOverrides = costs
    return
  }
  if (action.type === 'START') {
    startGame(state, action.config)
    return
  }
  if (action.type === 'ACK_CURTAIN') {
    const phase = state.resumePhase
    state.curtainPlayerId = null
    state.resumePhase = null
    if (phase) state.phase = phase
    return
  }
  if (action.type === 'BID') {
    const phase = state.phase === 'curtain' ? state.resumePhase : state.phase
    const ids = phase === 'bid_tie' ? state.tieIds : state.players.map((p) => p.id)
    const inferred = ids.find((id) => state.bids[id] === undefined) ?? currentActor(state).id
    const player = resolveActor(state, action, inferred)
    if (!ids.includes(player.id) || state.bids[player.id] !== undefined) return
    const amount = Math.floor(action.amount)
    if (amount < 0 || amount > player.cash || !Number.isFinite(amount)) return
    const paid = pay(player, amount)
    state.bids[player.id] = paid
    log(state, `${player.name} places a turn-order bid.`)
    const remaining = ids.filter((id) => state.bids[id] === undefined)
    if (remaining.length === 0) {
      state.phase = 'bid_reveal'
      return
    }
    if (state.playMode === 'online') {
      showSharedPhase(state, phase === 'bid_tie' ? 'bid_tie' : 'bid')
      return
    }
    showPhase(state, phase === 'bid_tie' ? 'bid_tie' : 'bid', remaining[0])
    return
  }
  if (action.type === 'ACK_BIDS') {
    if (state.phase !== 'bid_reveal') return
    if (state.bidRound === 'tie') finishTieBids(state)
    else finishMainBids(state)
    return
  }
  if (action.type === 'ROLL_DICE') {
    for (const id of state.tieIds) {
      if (state.dice[id] === undefined) state.dice[id] = roll2d6(state)
    }
    log(
      state,
      `Dice: ${state.tieIds.map((id) => `${playerById(state, id).name} ${state.dice[id]}`).join(', ')}.`,
    )
    if (state.phase === 'relief_dice') finishReliefDice(state)
    else finishDice(state)
    return
  }
  if (action.type === 'CONTRIBUTE') {
    const inferred = firstUnfinished(state, (p) => Boolean(state.contributed[p.id]))?.id
    const player = resolveActor(state, action, inferred)
    if (!player.hand.some((c) => c.uid === action.cardUid)) return
    if (state.contributed[player.id]) return
    state.contributed[player.id] = action.cardUid
    log(state, `${player.name} contributes a card to the market.`)
    const nxt = firstUnfinished(state, (p) => Boolean(state.contributed[p.id]))
    if (!nxt) revealPool(state)
    else if (state.playMode === 'online') showSharedPhase(state, 'contribute')
    else showPhase(state, 'contribute', nxt.id)
    return
  }
  if (state.pendingScheme && !state.pendingScheme.awaitingTargets && (action.type === 'VETO' || action.type === 'DECLINE_VETO')) {
    handleVeto(state, action)
    return
  }
  if (action.type === 'PASS_PRIVATE_VIEWING') {
    if (state.phase !== 'private_viewing') return
    const player = resolveActor(state, action, firstPvActor(state))
    if (!state.pvPassed.includes(player.id) && !state.pvQueue.includes(player.id)) {
      state.pvPassed.push(player.id)
    }
    advancePV(state)
    return
  }
  if (action.type === 'PLAY_PRIVATE_VIEWING') {
    if (state.phase !== 'private_viewing') return
    const player = resolveActor(state, action, firstPvActor(state))
    if (player.isBot) return
    if (state.pvQueue.includes(player.id) || state.pvPassed.includes(player.id)) return
    const card = player.schemes.find((c) => c.uid === action.cardUid && c.schemeId === 'private_viewing')
    if (!card || player.schemePlayedThisRound) return
    if (repP(player) < schemePlayCost('private_viewing', state.playerCount, state.stage)) return
    beginVeto(state, player, card.uid, 'private_viewing', {})
    return
  }
  if (action.type === 'BUY_POOL') {
    const player = currentActor(state)
    const card = state.pool.find((c) => c.uid === action.cardUid)
    if (!card || !canObtain(player, card)) return
    const price = poolPrice(state, player, card)
    if (player.cash < price) return
    pay(player, price)
    takeCard(state.pool, card.uid)
    giveCard(state, player, card)
    log(state, `${player.name} buys ${card.name} for $${price}M.`)
    nextPurchase(state)
    return
  }
  if (action.type === 'DISCARD_POOL') {
    const player = currentActor(state)
    const card = state.pool.find((c) => c.uid === action.cardUid)
    if (!card) return
    takeCard(state.pool, card.uid)
    state.publicDiscard.push(card)
    const paid = discardPay(state.stage)
    player.cash += paid
    log(state, `${player.name} discards ${card.name} for $${paid}M.`)
    nextPurchase(state)
    return
  }
  if (action.type === 'BUY_OPEN') {
    const player = currentActor(state)
    const price = openMarketPay(state.stage)
    if (player.cash < price) return
    if (action.item === 'cocoa') {
      if (state.openCocoa <= 0) return
      state.openCocoa -= 1
      player.supply.push(openMarketCard('cocoa'))
    } else {
      if (state.openSugar <= 0) return
      state.openSugar -= 1
      player.supply.push(openMarketCard('sugar'))
    }
    pay(player, price)
    log(state, `${player.name} buys Open Market ${action.item === 'cocoa' ? 'Cocoa' : 'Sugar'} for $${price}M.`)
    return
  }
  if (action.type === 'BUY_MASTERY') {
    const player = currentActor(state)
    const card = state.masteryMarket.find((c) => c.uid === action.cardUid)
    if (!card || !canObtain(player, card)) return
    const price = faceCost(state, card)
    if (player.cash < price) return
    pay(player, price)
    takeCard(state.masteryMarket, card.uid)
    obtainMastery(state, player, card)
    log(state, `${player.name} buys ${card.name} for $${price}M.`)
    return
  }
  if (action.type === 'DRAW_SCHEME') {
    const player = currentActor(state)
    if (state.schemeDraft?.length || player.schemes.length >= 3 || state.schemeDeck.length < 3 || repP(player) < 1) return
    player.spentRep += 1
    state.schemeDraft = [state.schemeDeck.shift()!, state.schemeDeck.shift()!, state.schemeDeck.shift()!]
    log(state, `${player.name} draws 3 Schemes (−1 Rep).`)
    refreshTitle(state)
    return
  }
  if (action.type === 'KEEP_SCHEME') {
    const player = currentActor(state)
    const draft = state.schemeDraft ?? []
    const keep = draft.find((c) => c.uid === action.cardUid)
    if (!keep) return
    player.schemes.push(keep)
    const rest = draft.filter((c) => c.uid !== keep.uid)
    state.schemeDeck.push(...rest)
    state.schemeDeck = shuffle(state.schemeDeck, state)
    state.schemeDraft = null
    log(state, `${player.name} keeps ${keep.name}.`)
    return
  }
  if (action.type === 'CHOOSE_RELIEF') {
    if (state.phase !== 'relief') return
    const player = resolveActor(state, action, reliefActor(state)?.id)
    applyRelief(state, action.kind, action.discardUid, player)
    return
  }
  if (action.type === 'SKIP_RELIEF') {
    if (state.phase !== 'relief') return
    const player = resolveActor(state, action, reliefActor(state)?.id)
    if (player) {
      log(state, `${player.name} skips remaining relief.`)
      state.reliefMax[player.id] = state.reliefPicks[player.id]?.length ?? 0
    }
    if (state.playMode === 'online') {
      if (!reliefStillOpen(state)) advanceStage(state)
      return
    }
    nextReliefPicker(state)
    return
  }
  if (action.type === 'PLAY_SCHEME') {
    if (state.schemeDraft?.length || state.pendingScheme) return
    const player = currentActor(state)
    const card = player.schemes.find((c) => c.uid === action.cardUid)
    if (!card) return
    if (card.schemeId === 'veto_power' || card.schemeId === 'private_viewing') return
    if (player.schemePlayedThisRound) return
    if (repP(player) < schemePlayCost(card.schemeId, state.playerCount, state.stage)) return
    beginVeto(state, player, card.uid, card.schemeId, {})
    return
  }
  if (action.type === 'CONFIRM_SCHEME_TARGETS') {
    const pending = state.pendingScheme
    if (!pending?.awaitingTargets) return
    const player = playerById(state, pending.playerId)
    if (!validSchemeTargets(state, player, pending.schemeId, action.targets)) return
    applyScheme(state, player, pending.schemeId, action.targets)
    state.pendingScheme = null
    refreshTitle(state)
    state.phase = 'scheme'
    state.curtainPlayerId = null
    const idx = state.turnOrder.indexOf(player.id)
    if (idx >= 0) state.actorIndex = idx
    return
  }
  if (action.type === 'SKIP_SCHEME') {
    if (state.schemeDraft?.length) return
    if (state.pendingScheme?.awaitingTargets) {
      log(state, `${playerById(state, state.pendingScheme.playerId).name}'s Scheme has no effect.`)
      state.pendingScheme = null
      refreshTitle(state)
      return
    }
    if (state.pendingScheme) return
    nextScheme(state)
    return
  }
  if (action.type === 'ASSIGN_RECIPE') {
    const player = resolveActor(state, action)
    if (state.assignmentDone[player.id]) return
    assignRecipe(state, player, action.factoryId, action.cardUids)
    return
  }
  if (action.type === 'TEAR_DOWN') {
    const player = resolveActor(state, action)
    if (state.assignmentDone[player.id]) return
    tearDown(state, player, action.factoryId)
    return
  }
  if (action.type === 'ASSIGN_SPECIALIST') {
    const player = resolveActor(state, action)
    if (state.assignmentDone[player.id]) return
    const card = player.supply.find((c) => c.uid === action.cardUid)
    if (!card) return
    if (card.kind === 'researcher') {
      player.assignedResP += card.resP ?? 0
      player.supply = player.supply.filter((c) => c.uid !== card.uid)
      log(state, `${player.name} assigns ${card.name} (+${card.resP} ResP).`)
    } else if (card.kind === 'journalist') {
      player.assignedRepP += card.repP ?? 0
      player.supply = player.supply.filter((c) => c.uid !== card.uid)
      log(state, `${player.name} assigns ${card.name} (+${card.repP} Rep).`)
      refreshTitle(state)
    } else if (card.kind === 'slot') {
      player.extraSlotPool += 1
      if (card.hazardous) player.extraHazardPool += 1
      player.supply = player.supply.filter((c) => c.uid !== card.uid)
      log(state, `${player.name} banks ${card.hazardous ? 'a hazardous extra slot' : 'an extra ingredient slot'}.`)
    }
    return
  }
  if (action.type === 'MOVE_SLOTS') {
    const player = resolveActor(state, action)
    if (state.assignmentDone[player.id]) return
    const factory = player.factories.find((f) => f.id === action.factoryId)
    if (!factory) return
    if (action.delta > 0 && player.extraSlotPool > 0) {
      if (player.extraHazardPool >= player.extraSlotPool) {
        player.extraHazardPool -= 1
        factory.hazardousSlots += 1
      }
      factory.extraSlots += 1
      player.extraSlotPool -= 1
    } else if (action.delta < 0 && factory.extraSlots > 0) {
      if (factory.ingredients.length > factoryCapacity({ ...factory, extraSlots: factory.extraSlots - 1 })) return
      if (factory.hazardousSlots > 0) {
        factory.hazardousSlots -= 1
        player.extraHazardPool += 1
      }
      factory.extraSlots -= 1
      player.extraSlotPool += 1
    }
    return
  }
  if (action.type === 'BUY_EXTRA_FACTORY') {
    const player = resolveActor(state, action)
    if (state.assignmentDone[player.id]) return
    if (player.boughtExtraFactory || repLevel(player) < 2 || player.cash < REP_FACTORY_COST) return
    pay(player, REP_FACTORY_COST)
    player.boughtExtraFactory = true
    player.factories.push({
      id: `${player.id}-fX`,
      extraSlots: 0,
      hazardousSlots: 0,
      ingredients: [],
      recipeId: null,
    })
    log(state, `${player.name} buys an extra factory for $${REP_FACTORY_COST}M.`)
    return
  }
  if (action.type === 'BUY_EXTRA_SLOT') {
    const player = resolveActor(state, action)
    if (state.assignmentDone[player.id]) return
    const track = action.track
    const cost = track === 1 ? REP_SLOT_L1_COST : REP_SLOT_L2_COST
    if (player.cash < cost) return
    if (track === 1) {
      if (player.boughtRepSlot || repLevel(player) < 1) return
      player.boughtRepSlot = true
    } else {
      if (player.boughtRepSlotL2 || repLevel(player) < 2) return
      player.boughtRepSlotL2 = true
    }
    pay(player, cost)
    player.extraSlotPool += 1
    log(state, `${player.name} buys the Reputation L${track} extra slot for $${cost}M.`)
    return
  }
  if (action.type === 'BUY_TRACK_RESEARCHER') {
    const player = resolveActor(state, action)
    if (state.assignmentDone[player.id]) return
    if (action.kind === 'junior') {
      if (player.boughtJuniorResearcher || repLevel(player) < 1 || player.cash < REP_JUNIOR_COST) return
      pay(player, REP_JUNIOR_COST)
      player.boughtJuniorResearcher = true
      player.assignedResP += 1
      log(state, `${player.name} buys a Junior Researcher for $${REP_JUNIOR_COST}M (+1 ResP).`)
    } else if (action.kind === 'senior_l2') {
      if (player.boughtSeniorResearcherL2 || repLevel(player) < 2 || player.cash < REP_SENIOR_COST) return
      pay(player, REP_SENIOR_COST)
      player.boughtSeniorResearcherL2 = true
      player.assignedResP += 2
      log(state, `${player.name} buys a Senior Researcher for $${REP_SENIOR_COST}M (+2 ResP).`)
    } else {
      if (player.boughtSeniorResearcherL3 || repLevel(player) < 3 || player.cash < REP_SENIOR_COST) return
      pay(player, REP_SENIOR_COST)
      player.boughtSeniorResearcherL3 = true
      player.assignedResP += 2
      log(state, `${player.name} buys a Senior Researcher for $${REP_SENIOR_COST}M (+2 ResP).`)
    }
    return
  }
  if (action.type === 'FINISH_ASSIGNMENT') {
    const player = resolveActor(state, action)
    if (state.assignmentDone[player.id]) return
    state.assignmentDone[player.id] = true
    log(state, `${player.name} finishes assigning.`)
    nextAssignment(state)
    return
  }
  if (action.type === 'SET_RECIPE_INCOME') {
    const income = Math.max(0, Math.floor(action.income))
    if (!Number.isFinite(income)) return
    state.incomeOverrides = { ...state.incomeOverrides, [action.recipeId]: income }
    log(state, `Dev: ${action.recipeId} income set to $${income}M.`)
    return
  }
  if (action.type === 'SET_CARD_COST') {
    const cost = Math.max(0, Math.floor(action.cost))
    if (!Number.isFinite(cost) || !action.cardName) return
    state.costOverrides = { ...state.costOverrides, [action.cardName]: cost }
    stampCardCosts(state)
    log(state, `Dev: ${action.cardName} cost set to $${cost}M.`)
    return
  }
  if (action.type === 'ACK_INCOME') {
    endRound(state)
  }
}

function handleVeto(state: GameState, action: Extract<Action, { type: 'VETO' | 'DECLINE_VETO' }>) {
  const vetoerId = currentVetoId(state)
  if (!vetoerId) {
    resolvePendingScheme(state)
    return
  }
  const vetoer = playerById(state, vetoerId)
  if (action.type === 'VETO') {
    const card = vetoer.schemes.find((c) => c.uid === action.cardUid && c.schemeId === 'veto_power')
    if (!card || repP(vetoer) < 1) return
    vetoer.spentRep += 1
    vetoer.schemes = vetoer.schemes.filter((c) => c.uid !== card.uid)
    state.schemeDiscard.push(card)
    const pending = state.pendingScheme
    if (pending) {
      const owner = playerById(state, pending.playerId)
      const played = owner.schemes.find((c) => c.uid === pending.cardUid)
      if (played) {
        owner.schemes = owner.schemes.filter((c) => c.uid !== played.uid)
        state.schemeDiscard.push(played)
      }
      log(state, `${vetoer.name} vetoes a Scheme. No play cost is charged.`)
      owner.schemePlayedThisRound = true
    }
    state.pendingScheme = null
    refreshTitle(state)
    if (state.resumePhase === 'private_viewing' || state.phase === 'private_viewing') {
      if (pending && !state.pvPassed.includes(pending.playerId) && !state.pvQueue.includes(pending.playerId)) {
        state.pvPassed.push(pending.playerId)
      }
      advancePV(state)
    } else {
      state.phase = 'scheme'
      state.curtainPlayerId = null
    }
    return
  }
  state.vetoIndex += 1
  const nxt = currentVetoId(state)
  if (!nxt) {
    const pending = state.pendingScheme
    resolvePendingScheme(state)
    if (pending?.schemeId !== 'private_viewing') {
      /* stay in current sequential phase */
    }
    return
  }
  maybeCurtain(state, nxt, state.resumePhase ?? 'scheme')
}

function advancePV(state: GameState) {
  if (finishPrivateViewingIfReady(state)) return
  const next = firstPvActor(state)
  if (!next) {
    beginPurchase(state)
    return
  }
  if (state.playMode === 'online') {
    showSharedPhase(state, 'private_viewing')
    return
  }
  showPhase(state, 'private_viewing', next)
}

function schemeNeedsTargets(schemeId: NonNullable<GameState['pendingScheme']>['schemeId']): boolean {
  return (
    schemeId === 'forced_swap' ||
    schemeId === 'black_market' ||
    schemeId === 'synthetic_ingredient' ||
    schemeId === 'unlicensed_chef' ||
    schemeId === 'artificial_shortage' ||
    schemeId === 'price_gouging' ||
    schemeId === 'embargo' ||
    schemeId === 'press_leak' ||
    schemeId === 'double_agent'
  )
}

function canChooseSchemeTargets(
  state: GameState,
  player: Player,
  schemeId: NonNullable<GameState['pendingScheme']>['schemeId'],
): boolean {
  if (schemeId === 'forced_swap') {
    return player.supply.length > 0 && state.players.some((p) => p.id !== player.id && p.supply.length > 0)
  }
  if (schemeId === 'black_market') return state.publicDiscard.length > 0
  if (schemeId === 'synthetic_ingredient') {
    return state.players.some((p) => p.id !== player.id && (p.supply.some((c) => c.family) || p.factories.some((f) => f.ingredients.some((c) => c.family))))
  }
  if (schemeId === 'double_agent') {
    return (
      player.hand.length >= 2 &&
      state.players.filter((p) => p.id !== player.id && p.hand.length > 0).length >= 2
    )
  }
  if (schemeId === 'press_leak') {
    return state.players.filter((p) => p.id !== player.id).length >= 2
  }
  return true
}

function validSchemeTargets(
  state: GameState,
  player: Player,
  schemeId: NonNullable<GameState['pendingScheme']>['schemeId'],
  targets: SchemeTargets,
): boolean {
  if (schemeId === 'forced_swap') {
    if (!targets.opponentId || !targets.ownCardUid || !targets.theirCardUid) return false
    const opp = state.players.find((p) => p.id === targets.opponentId)
    if (!opp || opp.id === player.id) return false
    return Boolean(
      player.supply.some((c) => c.uid === targets.ownCardUid) &&
        opp.supply.some((c) => c.uid === targets.theirCardUid),
    )
  }
  if (schemeId === 'synthetic_ingredient') {
    const opp = state.players.find((p) => p.id === targets.opponentId)
    return Boolean(opp && targets.family && ownsFamily(opp, targets.family))
  }
  if (schemeId === 'black_market') {
    return state.publicDiscard.some((c) => c.uid === targets.discardUid)
  }
  if (schemeId === 'unlicensed_chef') {
    return Boolean(targets.recipeId)
  }
  if (schemeId === 'artificial_shortage') {
    return Boolean(targets.family)
  }
  if (schemeId === 'price_gouging' || schemeId === 'embargo') {
    return Boolean(targets.family && targets.family !== 'cocoa' && targets.family !== 'sugar')
  }
  if (schemeId === 'double_agent') {
    if (!targets.opponentId || !targets.opponentId2 || targets.opponentId === targets.opponentId2) return false
    if (targets.opponentId === player.id || targets.opponentId2 === player.id) return false
    if (targets.ownCardUid === targets.ownCardUid2) return false
    const a = state.players.find((p) => p.id === targets.opponentId)
    const b = state.players.find((p) => p.id === targets.opponentId2)
    return Boolean(
      a &&
        b &&
        targets.ownCardUid &&
        targets.ownCardUid2 &&
        targets.theirCardUid &&
        targets.theirCardUid2 &&
        player.hand.some((c) => c.uid === targets.ownCardUid) &&
        player.hand.some((c) => c.uid === targets.ownCardUid2) &&
        a.hand.some((c) => c.uid === targets.theirCardUid) &&
        b.hand.some((c) => c.uid === targets.theirCardUid2),
    )
  }
  if (schemeId === 'press_leak') {
    if (!targets.opponentId || !targets.opponentId2 || targets.opponentId === targets.opponentId2) return false
    if (targets.opponentId === player.id || targets.opponentId2 === player.id) return false
    const a = state.players.find((p) => p.id === targets.opponentId)
    const b = state.players.find((p) => p.id === targets.opponentId2)
    if (!a || !b) return false
    if (targets.theirCardUid) {
      if (a.schemes.length < 2 || !a.schemes.some((c) => c.uid === targets.theirCardUid)) return false
    }
    if (targets.theirCardUid2) {
      if (b.schemes.length < 2 || !b.schemes.some((c) => c.uid === targets.theirCardUid2)) return false
    }
    return true
  }
  if (schemeId === 'defamation_ops') {
    const titleId = mostReputableId(state)
    return Boolean(titleId && titleId !== player.id)
  }
  return true
}

export function viewingPlayerId(state: GameState): string | null {
  if (state.phase === 'curtain') return state.curtainPlayerId
  if (state.pendingScheme?.awaitingTargets) return state.pendingScheme.playerId
  if (state.pendingScheme) return currentVetoId(state)
  if (state.phase === 'bid' || state.phase === 'bid_tie') {
    const ids = state.phase === 'bid_tie' ? state.tieIds : state.players.map((p) => p.id)
    return ids.find((id) => state.bids[id] === undefined) ?? null
  }
  if (state.phase === 'contribute') {
    return firstUnfinished(state, (p) => Boolean(state.contributed[p.id]))?.id ?? null
  }
  if (state.phase === 'private_viewing') return firstPvActor(state)
  if (state.phase === 'relief') {
    if (state.playMode === 'online') {
      return state.players.find((p) => playerNeedsAction(state, p.id))?.id ?? null
    }
    return state.reliefQueue[state.reliefIndex] ?? null
  }
  if (state.phase === 'assignment') {
    if (state.playMode === 'online') {
      return firstUnfinished(state, (p) => Boolean(state.assignmentDone[p.id]))?.id ?? null
    }
    return state.turnOrder[state.actorIndex] ?? null
  }
  if (state.phase === 'purchase' || state.phase === 'scheme') {
    return state.turnOrder[state.actorIndex] ?? null
  }
  return null
}

export function canDrawScheme(state: GameState, player: Player): boolean {
  return (
    player.schemes.length < 3 &&
    state.schemeDeck.length >= 3 &&
    !state.schemeDraft?.length &&
    !state.pendingScheme &&
    repP(player) >= 1
  )
}

const SHARED_ACTIONS = new Set<Action['type']>([
  'ACK_BIDS',
  'ROLL_DICE',
  'ACK_INCOME',
  'SET_RECIPE_INCOME',
  'SET_CARD_COST',
  'NEW_GAME',
  'START',
])

export function requiredActorId(state: GameState): string | null {
  if (state.pendingScheme?.awaitingTargets) return state.pendingScheme.playerId
  if (state.pendingScheme) return currentVetoId(state)
  if (state.phase === 'curtain') return state.curtainPlayerId
  if (
    state.phase === 'setup' ||
    state.phase === 'bid_reveal' ||
    state.phase === 'dice_tie' ||
    state.phase === 'relief_dice' ||
    state.phase === 'income' ||
    state.phase === 'game_over'
  ) {
    return null
  }
  if (state.playMode === 'online' && isAsyncPhase(state.phase)) return null
  return viewingPlayerId(state)
}

export function canPlayerAct(state: GameState, playerId: string | null, action?: Action): boolean {
  if (action && SHARED_ACTIONS.has(action.type)) return true
  if (!playerId) return state.playMode !== 'online'
  if (state.playMode === 'online' && isAsyncPhase(state.phase) && !state.pendingScheme) {
    return playerNeedsAction(state, playerId)
  }
  const required = requiredActorId(state)
  if (!required) return true
  return required === playerId
}

export { nextRand, resLevel, repLevel, finalScores }
