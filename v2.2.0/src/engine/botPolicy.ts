import {
  openMarketPay,
  RECIPES,
  RELIEF_CASH,
  REP_FACTORY_COST,
  REP_JUNIOR_COST,
  REP_SENIOR_COST,
  REP_SLOT_L1_COST,
  REP_SLOT_L2_COST,
  schemePlayCost,
} from './data'
import { canDrawScheme, viewingPlayerId } from './game'
import { buildableOnFactory, canObtain, currentVetoId, faceCost, playerById, poolPrice, repLevel, repP, resLevel, resP } from './queries'
import { publicIngredients, reliefStage } from './relief'
import { hash32 } from './botWeights'
import type { Action, GameCard, GameState, IngredientFamily, Player, SchemeTargets } from './types'
import trainedPolicy from './bot-policy.json'

const FAMILIES: IngredientFamily[] = [
  'cocoa',
  'sugar',
  'milk',
  'matcha',
  'coffee',
  'almond',
  'wild_berries',
  'caramel',
  'sea_salt',
  'royal_honey',
]

const SPECIAL = FAMILIES.filter((f) => f !== 'cocoa' && f !== 'sugar')

const ACTION_TYPES = [
  'BID',
  'CONTRIBUTE',
  'BUY_POOL',
  'DISCARD_POOL',
  'BUY_OPEN',
  'BUY_MASTERY',
  'PLAY_SCHEME',
  'SKIP_SCHEME',
  'DRAW_SCHEME',
  'KEEP_SCHEME',
  'PLAY_PRIVATE_VIEWING',
  'PASS_PRIVATE_VIEWING',
  'VETO',
  'DECLINE_VETO',
  'CONFIRM_SCHEME_TARGETS',
  'CHOOSE_RELIEF',
  'SKIP_RELIEF',
  'ASSIGN_RECIPE',
  'TEAR_DOWN',
  'ASSIGN_SPECIALIST',
  'MOVE_SLOTS',
  'BUY_EXTRA_SLOT',
  'BUY_EXTRA_FACTORY',
  'BUY_TRACK_RESEARCHER',
  'FINISH_ASSIGNMENT',
  'ACK_CURTAIN',
  'ACK_BIDS',
  'ACK_INCOME',
  'ROLL_DICE',
] as const

export const POLICY_DIM = 24 + ACTION_TYPES.length + 14

export type BotPolicy = { dim: number; w: number[]; temperature: number; games: number }

export type PolicyStep = { playerId: string; feats: number[][]; index: number }

let policy: BotPolicy = {
  dim: POLICY_DIM,
  w: Array.from({ length: POLICY_DIM }, () => 0),
  temperature: 1.25,
  games: 0,
}
let seatPolicies: Record<string, BotPolicy> | null = null
let forceLearned = false
let episode: PolicyStep[] = []

if (trainedPolicy?.w?.length === POLICY_DIM) {
  policy = {
    dim: POLICY_DIM,
    w: [...trainedPolicy.w],
    temperature: trainedPolicy.temperature ?? 0.9,
    games: trainedPolicy.games ?? 0,
  }
}

export function setForceLearnedPolicy(on: boolean) {
  forceLearned = on
}

export function forceLearnedPolicy() {
  return forceLearned
}

export function currentPolicy(): BotPolicy {
  return policy
}

export function setPolicy(next: BotPolicy) {
  policy = next
}

export function setSeatPolicies(map: Record<string, BotPolicy> | null) {
  seatPolicies = map
}

export function clonePolicy(source: BotPolicy): BotPolicy {
  return { dim: source.dim, w: [...source.w], temperature: source.temperature, games: source.games }
}

export function mutatePolicy(source: BotPolicy, rand: () => number, scale = 0.08): BotPolicy {
  const w = source.w.map((n) => Math.max(-4, Math.min(4, n + (rand() * 2 - 1) * scale)))
  return {
    dim: source.dim,
    w,
    temperature: Math.min(1.6, Math.max(0.7, source.temperature + (rand() * 2 - 1) * 0.08)),
    games: source.games,
  }
}

function livePolicy(playerId: string): BotPolicy {
  return seatPolicies?.[playerId] ?? policy
}

export function randomPolicy(seed = 1, temperature = 1.25): BotPolicy {
  const rand = rngFrom(seed)
  return {
    dim: POLICY_DIM,
    w: Array.from({ length: POLICY_DIM }, () => (rand() * 2 - 1) * 0.05),
    temperature,
    games: 0,
  }
}

export function beginEpisode() {
  episode = []
}

export function takeEpisode(): PolicyStep[] {
  const steps = episode
  episode = []
  return steps
}

function rngFrom(seed: number) {
  let x = seed | 0
  return () => {
    x = Math.imul(x ^ (x >>> 16), 2246822519)
    x = Math.imul(x ^ (x >>> 13), 3266489917)
    x ^= x >>> 16
    return (x >>> 0) / 4294967296
  }
}

function botRng(state: GameState, player: Player): () => number {
  const live = livePolicy(player.id)
  return rngFrom(hash32(`${state.seed}|${player.id}|${state.phase}|${state.round}|${state.logSeq}|${live.games}`))
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(2, n))
}

function firstUnfinishedId(state: GameState, done: (id: string) => boolean): string | undefined {
  for (const id of state.turnOrder.length ? state.turnOrder : state.players.map((p) => p.id)) {
    if (!done(id)) return id
  }
  return undefined
}

function actorId(state: GameState): string | null {
  if (state.phase === 'curtain') return state.curtainPlayerId
  if (state.pendingScheme?.awaitingTargets) return state.pendingScheme.playerId
  if (state.pendingScheme) return currentVetoId(state)
  if (state.phase === 'bid' || state.phase === 'bid_tie') {
    const ids = state.phase === 'bid_tie' ? state.tieIds : state.players.map((p) => p.id)
    return ids.find((id) => state.bids[id] === undefined) ?? null
  }
  if (state.phase === 'contribute') return firstUnfinishedId(state, (id) => Boolean(state.contributed[id])) ?? null
  if (state.phase === 'private_viewing') {
    return firstUnfinishedId(state, (id) => state.pvQueue.includes(id) || state.pvPassed.includes(id)) ?? null
  }
  if (state.phase === 'relief') {
    if (state.playMode === 'online') {
      return (
        state.players.find((p) => (state.reliefPicks[p.id]?.length ?? 0) < (state.reliefMax[p.id] ?? 0))?.id ?? null
      )
    }
    return state.reliefQueue[state.reliefIndex] ?? null
  }
  if (state.phase === 'assignment' && state.playMode === 'online') {
    return state.players.find((p) => p.isBot && !state.assignmentDone[p.id])?.id ?? null
  }
  return viewingPlayerId(state)
}

function bidAmounts(cash: number): number[] {
  const raw = [
    0,
    1,
    2,
    3,
    Math.round(cash * 0.1),
    Math.round(cash * 0.2),
    Math.round(cash * 0.35),
    Math.min(cash, 5),
    Math.min(cash, 8),
    Math.min(cash, 12),
    cash,
  ]
  return [...new Set(raw.map((n) => Math.max(0, Math.min(cash, Math.floor(n)))))]
}

function targetOptions(state: GameState, player: Player, schemeId: string): SchemeTargets[] {
  if (schemeId === 'black_market') return state.publicDiscard.map((c) => ({ discardUid: c.uid }))
  if (schemeId === 'unlicensed_chef') return RECIPES.filter((r) => r.requiredRes > 0).map((r) => ({ recipeId: r.id }))
  if (schemeId === 'artificial_shortage') return FAMILIES.map((family) => ({ family }))
  if (schemeId === 'price_gouging' || schemeId === 'embargo') return SPECIAL.map((family) => ({ family }))
  if (schemeId === 'synthetic_ingredient') {
    const out: SchemeTargets[] = []
    for (const opp of state.players) {
      if (opp.id === player.id) continue
      const seen = new Set<IngredientFamily>()
      for (const card of [...opp.supply, ...opp.factories.flatMap((f) => f.ingredients)]) {
        if (!card.family || seen.has(card.family)) continue
        seen.add(card.family)
        out.push({ opponentId: opp.id, family: card.family })
      }
    }
    return out
  }
  if (schemeId === 'forced_swap') {
    const out: SchemeTargets[] = []
    for (const opp of state.players) {
      if (opp.id === player.id || opp.supply.length === 0 || player.supply.length === 0) continue
      for (const mine of player.supply.slice(0, 3)) {
        for (const theirs of opp.supply.slice(0, 3)) {
          out.push({ opponentId: opp.id, ownCardUid: mine.uid, theirCardUid: theirs.uid })
        }
      }
    }
    return out.slice(0, 12)
  }
  if (schemeId === 'double_agent') {
    const opps = state.players.filter((p) => p.id !== player.id && p.hand.length > 0)
    if (opps.length < 2 || player.hand.length < 2) return []
    const out: SchemeTargets[] = []
    for (let i = 0; i < opps.length; i += 1) {
      for (let j = i + 1; j < opps.length; j += 1) {
        const a = opps[i]
        const b = opps[j]
        if (!a.hand[0] || !b.hand[0]) continue
        out.push({
          opponentId: a.id,
          opponentId2: b.id,
          ownCardUid: player.hand[0].uid,
          ownCardUid2: player.hand[1].uid,
          theirCardUid: a.hand[0].uid,
          theirCardUid2: b.hand[0].uid,
        })
      }
    }
    return out.slice(0, 8)
  }
  if (schemeId === 'press_leak') {
    const opps = state.players.filter((p) => p.id !== player.id)
    if (opps.length < 2) return []
    const out: SchemeTargets[] = []
    for (let i = 0; i < opps.length; i += 1) {
      for (let j = i + 1; j < opps.length; j += 1) {
        const a = opps[i]
        const b = opps[j]
        out.push({
          opponentId: a.id,
          opponentId2: b.id,
          theirCardUid: a.schemes.length >= 2 ? a.schemes[0].uid : undefined,
          theirCardUid2: b.schemes.length >= 2 ? b.schemes[0].uid : undefined,
        })
      }
    }
    return out.slice(0, 8)
  }
  return [{}]
}

export function legalBotActions(state: GameState): { player: Player; actions: Action[] } | null {
  const allBots = state.players.every((p) => p.isBot)
  if (state.phase === 'bid_reveal') {
    if (!allBots) return null
    return { player: state.players[0], actions: [{ type: 'ACK_BIDS' }] }
  }
  if (state.phase === 'dice_tie' || state.phase === 'relief_dice') {
    if (!allBots) return null
    return { player: state.players[0], actions: [{ type: 'ROLL_DICE' }] }
  }
  if (state.phase === 'income') {
    if (!allBots) return null
    return { player: state.players[0], actions: [{ type: 'ACK_INCOME' }] }
  }
  if (state.phase === 'curtain' && state.curtainPlayerId) {
    const player = playerById(state, state.curtainPlayerId)
    if (!player.isBot) return null
    return { player, actions: [{ type: 'ACK_CURTAIN' }] }
  }

  const id = actorId(state)
  if (!id) return null
  const player = playerById(state, id)
  if (!player.isBot) return null
  const actions: Action[] = []

  if (state.pendingScheme?.awaitingTargets) {
    const opts = targetOptions(state, player, state.pendingScheme.schemeId)
    for (const targets of opts) actions.push({ type: 'CONFIRM_SCHEME_TARGETS', targets })
    actions.push({ type: 'SKIP_SCHEME' })
    return { player, actions }
  }
  if (state.pendingScheme) {
    const veto = player.schemes.find((c) => c.schemeId === 'veto_power')
    if (veto && repP(player) >= 1 && state.pendingScheme.playerId !== player.id) {
      actions.push({ type: 'VETO', cardUid: veto.uid })
    }
    actions.push({ type: 'DECLINE_VETO' })
    return { player, actions }
  }
  if (state.phase === 'bid' || state.phase === 'bid_tie') {
    for (const amount of bidAmounts(player.cash)) actions.push({ type: 'BID', amount, actorId: player.id })
    return { player, actions }
  }
  if (state.phase === 'contribute') {
    for (const card of player.hand) actions.push({ type: 'CONTRIBUTE', cardUid: card.uid, actorId: player.id })
    return { player, actions }
  }
  if (state.phase === 'private_viewing') {
    const pv = player.schemes.find((c) => c.schemeId === 'private_viewing')
    const cost = schemePlayCost('private_viewing', state.playerCount, state.stage)
    if (pv && !player.schemePlayedThisRound && repP(player) >= cost) {
      actions.push({ type: 'PLAY_PRIVATE_VIEWING', cardUid: pv.uid, actorId: player.id })
    }
    actions.push({ type: 'PASS_PRIVATE_VIEWING', actorId: player.id })
    return { player, actions }
  }
  if (state.phase === 'purchase') {
    if (player.cash >= openMarketPay(state.stage)) {
      if (state.openCocoa > 0) actions.push({ type: 'BUY_OPEN', item: 'cocoa' })
      if (state.openSugar > 0) actions.push({ type: 'BUY_OPEN', item: 'sugar' })
    }
    for (const card of state.masteryMarket) {
      if (canObtain(player, card) && player.cash >= faceCost(state, card)) {
        actions.push({ type: 'BUY_MASTERY', cardUid: card.uid })
      }
    }
    for (const card of state.pool) {
      const price = poolPrice(state, player, card)
      if (canObtain(player, card) && player.cash >= price) actions.push({ type: 'BUY_POOL', cardUid: card.uid })
      actions.push({ type: 'DISCARD_POOL', cardUid: card.uid })
    }
    return { player, actions }
  }
  if (state.phase === 'scheme') {
    if (state.schemeDraft?.length) {
      for (const card of state.schemeDraft) actions.push({ type: 'KEEP_SCHEME', cardUid: card.uid })
      return { player, actions }
    }
    if (!player.schemePlayedThisRound) {
      for (const card of player.schemes) {
        if (card.schemeId === 'veto_power' || card.schemeId === 'private_viewing') continue
        const cost = schemePlayCost(card.schemeId, state.playerCount, state.stage)
        if (repP(player) < cost) continue
        actions.push({ type: 'PLAY_SCHEME', cardUid: card.uid })
      }
    }
    if (canDrawScheme(state, player)) actions.push({ type: 'DRAW_SCHEME' })
    actions.push({ type: 'SKIP_SCHEME' })
    return { player, actions }
  }
  if (state.phase === 'relief') {
    const taken = state.reliefPicks[player.id] ?? []
    const max = state.reliefMax[player.id] ?? 0
    if (taken.length < max) {
      if (!taken.includes('res')) actions.push({ type: 'CHOOSE_RELIEF', kind: 'res', actorId: player.id })
      if (!taken.includes('rep')) actions.push({ type: 'CHOOSE_RELIEF', kind: 'rep', actorId: player.id })
      if (!taken.includes('cash')) actions.push({ type: 'CHOOSE_RELIEF', kind: 'cash', actorId: player.id })
      if (!taken.includes('discard')) {
        for (const card of publicIngredients(state)) {
          actions.push({ type: 'CHOOSE_RELIEF', kind: 'discard', discardUid: card.uid, actorId: player.id })
        }
      }
    }
    actions.push({ type: 'SKIP_RELIEF', actorId: player.id })
    return { player, actions }
  }
  if (state.phase === 'assignment') {
    if (state.assignmentDone[player.id]) return null
    for (const card of player.supply) {
      if (card.kind === 'researcher' || card.kind === 'journalist' || card.kind === 'slot') {
        actions.push({ type: 'ASSIGN_SPECIALIST', cardUid: card.uid })
      }
    }
    if (!player.boughtRepSlot && repLevel(player) >= 1 && player.cash >= REP_SLOT_L1_COST) {
      actions.push({ type: 'BUY_EXTRA_SLOT', track: 1 })
    }
    if (!player.boughtRepSlotL2 && repLevel(player) >= 2 && player.cash >= REP_SLOT_L2_COST) {
      actions.push({ type: 'BUY_EXTRA_SLOT', track: 2 })
    }
    if (!player.boughtExtraFactory && repLevel(player) >= 2 && player.cash >= REP_FACTORY_COST) {
      actions.push({ type: 'BUY_EXTRA_FACTORY' })
    }
    if (!player.boughtJuniorResearcher && repLevel(player) >= 1 && player.cash >= REP_JUNIOR_COST) {
      actions.push({ type: 'BUY_TRACK_RESEARCHER', kind: 'junior' })
    }
    if (!player.boughtSeniorResearcherL2 && repLevel(player) >= 2 && player.cash >= REP_SENIOR_COST) {
      actions.push({ type: 'BUY_TRACK_RESEARCHER', kind: 'senior_l2' })
    }
    if (!player.boughtSeniorResearcherL3 && repLevel(player) >= 3 && player.cash >= REP_SENIOR_COST) {
      actions.push({ type: 'BUY_TRACK_RESEARCHER', kind: 'senior_l3' })
    }
    for (const factory of player.factories) {
      if (factory.recipeId) actions.push({ type: 'TEAR_DOWN', factoryId: factory.id })
      if (player.extraSlotPool > 0) actions.push({ type: 'MOVE_SLOTS', factoryId: factory.id, delta: 1 })
      for (const ready of buildableOnFactory(state, player, factory).slice(0, 3)) {
        actions.push({ type: 'ASSIGN_RECIPE', factoryId: factory.id, cardUids: ready.cards.map((c) => c.uid) })
      }
    }
    actions.push({ type: 'FINISH_ASSIGNMENT' })
    return { player, actions }
  }
  return null
}

function cardByUid(state: GameState, player: Player, uid?: string): GameCard | undefined {
  if (!uid) return undefined
  return (
    player.hand.find((c) => c.uid === uid) ??
    player.supply.find((c) => c.uid === uid) ??
    state.pool.find((c) => c.uid === uid) ??
    state.publicDiscard.find((c) => c.uid === uid) ??
    state.masteryMarket.find((c) => c.uid === uid)
  )
}

export function actionFeatures(state: GameState, player: Player, action: Action): number[] {
  const others = state.players.filter((p) => p.id !== player.id)
  const bestCash = Math.max(1, ...others.map((p) => p.cash))
  const bestRes = Math.max(1, ...others.map((p) => resP(p)))
  const bestRep = Math.max(1, ...others.map((p) => repP(p)))
  const filled = player.factories.filter((f) => f.recipeId).length
  const stateFeat = [
    clamp01(state.stage / 3),
    clamp01(state.round / 8),
    clamp01(player.cash / 80),
    clamp01(resP(player) / 15),
    clamp01(repP(player) / 20),
    clamp01(resLevel(player) / 3),
    clamp01(repLevel(player) / 3),
    clamp01(filled / 5),
    clamp01(player.extraSlotPool / 4),
    clamp01(player.hand.length / 9),
    clamp01(player.schemes.length / 3),
    player.mastery ? 1 : 0,
    clamp01(state.pool.length / 4),
    clamp01(state.openCocoa / 8),
    clamp01((3 - state.stage) * 8 + (9 - state.round) / 24),
    clamp01(player.cash / bestCash),
    clamp01(resP(player) / bestRes),
    clamp01(repP(player) / bestRep),
    state.phase === 'bid_tie' ? 1 : 0,
    state.turnOrder[0] === player.id ? 1 : 0,
    clamp01((state.turnOrder.indexOf(player.id) + 1) / 4),
    player.schemePlayedThisRound ? 1 : 0,
    clamp01((state.reliefMax[player.id] ?? 0) / 2),
    clamp01((RELIEF_CASH[reliefStage(state)] ?? 10) / 20),
  ]
  const typeFeat = ACTION_TYPES.map((t) => (action.type === t ? 1 : 0))
  const card = cardByUid(
    state,
    player,
    'cardUid' in action
      ? action.cardUid
      : 'discardUid' in action
        ? action.discardUid
        : undefined,
  )
  const amount = action.type === 'BID' ? action.amount : 0
  const actionFeat = [
    clamp01(amount / 20),
    clamp01((card?.cost ?? 0) / 80),
    card?.kind === 'researcher' ? 1 : 0,
    card?.kind === 'journalist' ? 1 : 0,
    card?.kind === 'slot' ? 1 : 0,
    card?.kind === 'ingredient' ? 1 : 0,
    card?.premium ? 1 : 0,
    action.type === 'DISCARD_POOL' ? 1 : 0,
    action.type === 'FINISH_ASSIGNMENT' ? 1 : 0,
    action.type === 'SKIP_SCHEME' || action.type === 'SKIP_RELIEF' ? 1 : 0,
    action.type === 'CHOOSE_RELIEF' && action.kind === 'res' ? 1 : 0,
    action.type === 'CHOOSE_RELIEF' && action.kind === 'rep' ? 1 : 0,
    action.type === 'CHOOSE_RELIEF' && action.kind === 'cash' ? 1 : 0,
    clamp01(('cardUids' in action ? action.cardUids.length : 0) / 6),
  ]
  const feats = [...stateFeat, ...typeFeat, ...actionFeat]
  while (feats.length < POLICY_DIM) feats.push(0)
  return feats.slice(0, POLICY_DIM)
}

function dot(w: number[], f: number[]) {
  let s = 0
  for (let i = 0; i < w.length; i += 1) s += w[i] * (f[i] ?? 0)
  return s
}

function softmax(scores: number[], temperature: number) {
  const t = Math.max(0.15, temperature)
  const max = Math.max(...scores)
  const exps = scores.map((s) => Math.exp((s - max) / t))
  const sum = exps.reduce((a, b) => a + b, 0) || 1
  return exps.map((e) => e / sum)
}

export function policyBotAction(state: GameState, record = false): Action | null {
  const listed = legalBotActions(state)
  if (!listed || listed.actions.length === 0) return null
  const { player, actions } = listed
  const live = livePolicy(player.id)
  const feats = actions.map((action) => actionFeatures(state, player, action))
  const scores = feats.map((f) => dot(live.w, f))
  const probs = softmax(scores, live.temperature)
  const rand = botRng(state, player)
  let ticket = rand()
  let index = 0
  for (let i = 0; i < probs.length; i += 1) {
    ticket -= probs[i]
    if (ticket <= 0) {
      index = i
      break
    }
    index = i
  }
  if (record && !['ACK_CURTAIN', 'ACK_BIDS', 'ACK_INCOME', 'ROLL_DICE'].includes(actions[index].type)) {
    episode.push({ playerId: player.id, feats, index })
  }
  return actions[index]
}

export function applyReinforce(target: BotPolicy, steps: PolicyStep[], scores: Record<string, number>, lr = 0.02): BotPolicy {
  const vals = Object.values(scores)
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length)
  const std = Math.max(12, Math.sqrt(variance))
  const next = [...target.w]
  const mine = steps.filter((step) => scores[step.playerId] !== undefined)
  for (const step of mine) {
    const advantage = ((scores[step.playerId] ?? mean) - mean) / std
    const logits = step.feats.map((f) => dot(next, f))
    const probs = softmax(logits, target.temperature)
    const baseline = step.feats[0].map((_, i) => step.feats.reduce((s, f, j) => s + probs[j] * f[i], 0))
    const chosen = step.feats[step.index]
    for (let i = 0; i < next.length; i += 1) {
      next[i] += lr * advantage * (chosen[i] - baseline[i])
      next[i] = Math.max(-4, Math.min(4, next[i]))
    }
  }
  return { ...target, w: next, games: target.games + 1 }
}

export function reinforce(steps: PolicyStep[], scores: Record<string, number>, lr = 0.02) {
  policy = applyReinforce(policy, steps, scores, lr)
}
