import { factoryLimit, RECIPES, REP_FACTORY_COST, REP_SLOT_L1_COST, REP_SLOT_L2_COST, SCHEME_INFO, schemePlayCost } from './data'
import { canDrawScheme, reduce } from './game'
import { bestTierRecipe, factoryIncome, recipePay } from './income'
import {
  canAssignRecipe,
  canObtain,
  currentVetoId,
  factoryCapacity,
  mostReputableId,
  playerById,
  poolPrice,
  producedCount,
  requiredResLevel,
  repLevel,
  repP,
  resLevel,
} from './queries'
import type { Action, Factory, GameCard, GameState, Player, Recipe, SchemeTargets } from './types'

function cardValue(card: GameCard, player: Player): number {
  if (card.kind === 'researcher') return 8 + (card.resP ?? 0) * 4
  if (card.kind === 'journalist') return 7 + (card.repP ?? 0) * 4
  if (card.kind === 'slot') return player.extraSlotPool >= 2 ? 3 : 9
  if (card.kind === 'mastery') return resLevel(player) >= 3 || repLevel(player) >= 3 ? 20 : 1
  if (card.family === 'strawberry' && repLevel(player) < 2) return 1
  if (card.family === 'sea_salt' && resLevel(player) < 2) return 1
  return card.cost + (card.premium ? 4 : 0)
}

function pickContribute(state: GameState, player: Player): string {
  const first = state.turnOrder[0] === player.id
  const ranked = [...player.hand].sort((a, b) => cardValue(a, player) - cardValue(b, player))
  return first ? ranked[ranked.length - 1].uid : ranked[0].uid
}

function pickPurchase(state: GameState, player: Player): Action {
  let best: GameCard | null = null
  let bestScore = -99
  for (const card of state.pool) {
    if (!canObtain(player, card)) continue
    const price = poolPrice(state, player, card)
    if (player.cash < price) continue
    const score = cardValue(card, player) - price
    if (score > bestScore) {
      bestScore = score
      best = card
    }
  }
  if (best && bestScore >= 0) return { type: 'BUY_POOL', cardUid: best.uid }
  if (player.cash <= 4) {
    const pricey = [...state.pool].sort((a, b) => b.cost - a.cost)[0]
    return { type: 'DISCARD_POOL', cardUid: pricey.uid }
  }
  if (best) return { type: 'BUY_POOL', cardUid: best.uid }
  return { type: 'DISCARD_POOL', cardUid: state.pool[0].uid }
}

function maybeOpenMarket(state: GameState, player: Player): Action | null {
  const cocoa = player.supply.filter((c) => c.family === 'cocoa').length
  const sugar = player.supply.filter((c) => c.family === 'sugar').length
  if (player.cash < 8) return null
  if (cocoa < 1 && state.openCocoa > 0) return { type: 'BUY_OPEN', item: 'cocoa' }
  if (sugar < 1 && state.openSugar > 0) return { type: 'BUY_OPEN', item: 'sugar' }
  return null
}

function schemeTargets(state: GameState, player: Player, schemeId: string): SchemeTargets | null {
  if (
    schemeId === 'unethical_research' ||
    schemeId === 'labour_exploitation' ||
    schemeId === 'overworked' ||
    schemeId === 'class_revolution' ||
    schemeId === 'secret_project' ||
    schemeId === 'hostile_takeover' ||
    schemeId === 'money_laundering'
  ) {
    return {}
  }
  if (schemeId === 'black_market') {
    if (state.publicDiscard.length === 0) return null
    const card = [...state.publicDiscard].sort((a, b) => cardValue(b, player) - cardValue(a, player))[0]
    return { discardUid: card.uid }
  }
  if (schemeId === 'patent_lawsuit' || schemeId === 'monopoly') {
    const recipeId = player.factories.find((f) => f.recipeId)?.recipeId
    if (!recipeId) return null
    return { recipeId }
  }
  if (schemeId === 'unlicensed_chef') {
    const locked = RECIPES.find((r) => r.tier - 1 > resLevel(player))
    return { recipeId: locked?.id ?? 'extra_dark' }
  }
  if (schemeId === 'forced_swap') {
    const opp = state.players.find((p) => p.id !== player.id && p.supply.length > 0)
    if (!opp || player.supply.length === 0) return null
    const mine = [...player.supply].sort((a, b) => a.cost - b.cost)[0]
    const theirs = [...opp.supply].sort((a, b) => b.cost - a.cost)[0]
    return { opponentId: opp.id, ownCardUid: mine.uid, theirCardUid: theirs.uid }
  }
  if (schemeId === 'artificial_shortage') {
    const card = player.supply.find((c) => c.kind === 'ingredient' && c.family)
    if (!card?.family) return { family: 'cocoa' }
    return { family: card.family }
  }
  if (schemeId === 'price_gouging' || schemeId === 'embargo') {
    const fam = player.supply.find((c) => c.family && c.family !== 'cocoa' && c.family !== 'sugar')?.family
    if (!fam) return { family: 'milk' }
    return { family: fam }
  }
  if (schemeId === 'defamation_ops') {
    const titleId = mostReputableId(state)
    if (!titleId || titleId === player.id) return null
    return {}
  }
  if (schemeId === 'double_agent') {
    const opps = state.players.filter((p) => p.id !== player.id && p.hand.length > 0)
    if (opps.length < 2 || player.hand.length < 2) return null
    return {
      opponentId: opps[0].id,
      opponentId2: opps[1].id,
      ownCardUid: player.hand[0].uid,
      ownCardUid2: player.hand[1].uid,
      theirCardUid: opps[0].hand[0].uid,
      theirCardUid2: opps[1].hand[0].uid,
    }
  }
  return {}
}

function pickScheme(state: GameState, player: Player): Action {
  if (state.schemeDraft?.length) {
    return { type: 'KEEP_SCHEME', cardUid: state.schemeDraft[0].uid }
  }
  if (!player.schemePlayedThisRound) {
    const playable = player.schemes.filter((c) => {
      if (c.schemeId === 'veto_power' || c.schemeId === 'private_viewing') return false
      return repP(player) >= schemePlayCost(c.schemeId, state.playerCount, state.stage)
    })
    const ranked = playable.sort((a, b) => {
      const prefer = ['unethical_research', 'black_market', 'labour_exploitation', 'unlicensed_chef']
      return prefer.indexOf(a.schemeId) - prefer.indexOf(b.schemeId)
    })
    for (const card of ranked) {
      const targets = schemeTargets(state, player, card.schemeId)
      if (targets) return { type: 'PLAY_SCHEME', cardUid: card.uid, targets }
    }
  }
  if (canDrawScheme(state, player) && player.schemes.length < 2 && repP(player) >= 3) {
    return { type: 'DRAW_SCHEME' }
  }
  return { type: 'SKIP_SCHEME' }
}

function allIngredients(player: Player): GameCard[] {
  return [
    ...player.factories.flatMap((f) => f.ingredients),
    ...player.supply.filter((c) => c.kind === 'ingredient'),
  ]
}

function pickIngredients(pool: GameCard[], recipe: Recipe, used: Set<string>): GameCard[] | null {
  const picked: GameCard[] = []
  const local = new Set(used)
  for (const fam of recipe.ingredients) {
    const options = pool.filter((c) => c.kind === 'ingredient' && c.family === fam && !local.has(c.uid))
    if (options.length === 0) return null
    const card = [...options].sort((a, b) => Number(b.premium) - Number(a.premium))[0]
    local.add(card.uid)
    picked.push(card)
  }
  return picked
}

function plannedValue(state: GameState, player: Player, factory: Factory, recipe: Recipe, cards: GameCard[]): number {
  const fake: Factory = { ...factory, recipeId: recipe.id, ingredients: cards }
  return factoryIncome(state, player, fake)
}

type PlannedAssign = { factoryId: string; recipeId: string; cardUids: string[]; value: number }

function planAssignments(state: GameState, player: Player): PlannedAssign[] {
  const pool = allIngredients(player)
  const used = new Set<string>()
  const reserved = new Set<string>()
  const extraLeft = { n: player.extraSlotPool }
  const ownCurrent = (recipeId: string) => player.factories.filter((f) => f.recipeId === recipeId).length
  const plannedCount: Record<string, number> = {}
  const recipes = [...RECIPES].sort((a, b) => recipePay(state, b) - recipePay(state, a) || b.ingredients.length - a.ingredients.length)
  const factories = [...player.factories].sort((a, b) => b.extraSlots - a.extraSlots)
  const plan: PlannedAssign[] = []

  for (const recipe of recipes) {
    const unlocked = resLevel(player) >= requiredResLevel(recipe) || player.unlicensedRecipes.includes(recipe.id)
    if (!unlocked) continue
    const blocked = state.effects.some(
      (e) => e.kind === 'monopoly' && e.recipeId === recipe.id && e.ownerId !== player.id && e.remaining > 0,
    )
    if (blocked) continue
    const others = producedCount(state, recipe.id) - ownCurrent(recipe.id)
    const already = others + (plannedCount[recipe.id] ?? 0)
    if (already >= factoryLimit(recipe, state.playerCount)) continue

    const cards = pickIngredients(pool, recipe, used)
    if (!cards) continue
    const factory = factories.find((f) => {
      if (reserved.has(f.id)) return false
      const need = cards.length - factoryCapacity(f)
      return need <= extraLeft.n
    })
    if (!factory) continue
    const need = Math.max(0, cards.length - factoryCapacity(factory))
    extraLeft.n -= need
    reserved.add(factory.id)
    for (const c of cards) used.add(c.uid)
    plannedCount[recipe.id] = (plannedCount[recipe.id] ?? 0) + 1
    plan.push({
      factoryId: factory.id,
      recipeId: recipe.id,
      cardUids: cards.map((c) => c.uid),
      value: plannedValue(state, player, factory, recipe, cards),
    })
  }
  return plan
}

function shouldTearFactory(state: GameState, player: Player, factory: Factory, plan: PlannedAssign[]): boolean {
  const want = plan.find((item) => item.factoryId === factory.id)
  if (!factory.recipeId) return false
  if (!want) return true
  if (want.recipeId !== factory.recipeId) return true
  const current = factoryIncome(state, player, factory)
  return want.value > current
}

function pickAssignment(state: GameState, player: Player): Action {
  const specialist = player.supply.find((c) => c.kind === 'researcher' || c.kind === 'journalist' || c.kind === 'slot')
  if (specialist) return { type: 'ASSIGN_SPECIALIST', cardUid: specialist.uid }
  if (!player.boughtRepSlot && repLevel(player) >= 1 && player.cash >= REP_SLOT_L1_COST + 7) {
    return { type: 'BUY_EXTRA_SLOT', track: 1 }
  }
  if (!player.boughtRepSlotL2 && repLevel(player) >= 2 && player.cash >= REP_SLOT_L2_COST + 7) {
    return { type: 'BUY_EXTRA_SLOT', track: 2 }
  }
  if (!player.boughtExtraFactory && repLevel(player) >= 2 && player.cash >= REP_FACTORY_COST + 8) {
    return { type: 'BUY_EXTRA_FACTORY' }
  }
  if (
    (player.mastery === 'jack_of_all_trades' || player.mastery === 'heritage_line') &&
    !player.masteryChoices.t1
  ) {
    const t1 = bestTierRecipe(player, 1) ?? RECIPES.find((r) => r.tier === 1)?.id
    if (t1) {
      return {
        type: 'SET_MASTERY_CHOICES',
        choices: {
          t1,
          t2: bestTierRecipe(player, 2) ?? RECIPES.find((r) => r.tier === 2)?.id,
          t3: bestTierRecipe(player, 3) ?? RECIPES.find((r) => r.tier === 3)?.id,
        },
      }
    }
  }

  const plan = planAssignments(state, player)
  const currentVal = player.factories.reduce((sum, f) => sum + factoryIncome(state, player, f), 0)
  const planVal = plan.reduce((sum, item) => sum + item.value, 0)
  const rebuild = planVal > currentVal

  if (rebuild) {
    for (const factory of player.factories) {
      if (shouldTearFactory(state, player, factory, plan)) {
        return { type: 'TEAR_DOWN', factoryId: factory.id }
      }
    }
  }

  for (const item of plan) {
    const factory = player.factories.find((f) => f.id === item.factoryId)
    if (!factory || factory.recipeId) continue
    const missing = item.cardUids.filter((id) => !player.supply.some((c) => c.uid === id))
    if (missing.length > 0) {
      const blocker = player.factories.find((f) => f.ingredients.some((c) => missing.includes(c.uid)))
      if (blocker) return { type: 'TEAR_DOWN', factoryId: blocker.id }
      continue
    }
    const cards = item.cardUids.map((id) => player.supply.find((c) => c.uid === id)!)
    const check = canAssignRecipe(state, player, factory, cards)
    if (!check.ok && check.reason.includes('slots') && player.extraSlotPool > 0) {
      return { type: 'MOVE_SLOTS', factoryId: factory.id, delta: 1 }
    }
    if (check.ok) return { type: 'ASSIGN_RECIPE', factoryId: factory.id, cardUids: item.cardUids }
  }

  return { type: 'FINISH_ASSIGNMENT' }
}

export function botAction(state: GameState): Action | null {
  if (state.phase === 'curtain' && state.curtainPlayerId) {
    const p = playerById(state, state.curtainPlayerId)
    if (!p.isBot) return null
    return { type: 'ACK_CURTAIN' }
  }
  if (state.pendingScheme) {
    const vetoId = currentVetoId(state)
    if (!vetoId) return { type: 'DECLINE_VETO' }
    const vetoer = playerById(state, vetoId)
    if (!vetoer.isBot) return null
    const veto = vetoer.schemes.find((c) => c.schemeId === 'veto_power')
    const hostile = [
      'patent_lawsuit',
      'monopoly',
      'forced_swap',
      'artificial_shortage',
      'price_gouging',
      'embargo',
      'overworked',
      'class_revolution',
      'double_agent',
      'defamation_ops',
      'hostile_takeover',
    ]
    if (
      veto &&
      repP(vetoer) >= 1 &&
      hostile.includes(state.pendingScheme.schemeId) &&
      state.pendingScheme.playerId !== vetoer.id
    ) {
      return { type: 'VETO', cardUid: veto.uid }
    }
    return { type: 'DECLINE_VETO' }
  }
  const allBots = state.players.every((p) => p.isBot)
  if (state.phase === 'bid_reveal') return allBots ? { type: 'ACK_BIDS' } : null
  if (state.phase === 'dice_tie' || state.phase === 'relief_dice') return allBots ? { type: 'ROLL_DICE' } : null
  if (state.phase === 'income') return allBots ? { type: 'ACK_INCOME' } : null
  if (state.phase === 'relief') {
    const id = state.reliefQueue[state.reliefIndex]
    if (!id) return null
    const picker = playerById(state, id)
    if (!picker.isBot) return null
    const taken = state.reliefPicks[picker.id] ?? []
    if (!taken.includes('cash')) return { type: 'CHOOSE_RELIEF', kind: 'cash' }
    return { type: 'SKIP_RELIEF' }
  }

  const actorId =
    state.phase === 'bid' || state.phase === 'bid_tie'
      ? (state.phase === 'bid_tie' ? state.tieIds : state.players.map((p) => p.id)).find(
          (id) => state.bids[id] === undefined,
        )
      : state.turnOrder[state.actorIndex]
  if (!actorId) return null
  const player = playerById(state, actorId)
  if (!player.isBot) return null

  if (state.phase === 'bid' || state.phase === 'bid_tie') {
    const amount = player.cash >= 8 ? 1 : 0
    return { type: 'BID', amount }
  }
  if (state.phase === 'contribute') return { type: 'CONTRIBUTE', cardUid: pickContribute(state, player) }
  if (state.phase === 'private_viewing') {
    return { type: 'PASS_PRIVATE_VIEWING' }
  }
  if (state.phase === 'purchase') {
    const market = maybeOpenMarket(state, player)
    if (market) return market
    return pickPurchase(state, player)
  }
  if (state.phase === 'scheme') return pickScheme(state, player)
  if (state.phase === 'assignment') return pickAssignment(state, player)
  return null
}

export function flushBots(state: GameState): GameState {
  let current = state
  let lastKey = ''
  let repeats = 0
  for (let i = 0; i < 8000; i += 1) {
    const action = botAction(current)
    if (!action) break
    const key = JSON.stringify(action)
    repeats = key === lastKey ? repeats + 1 : 0
    lastKey = key
    if (repeats > 8) break
    const next = reduce(current, action)
    if (next === current) break
    current = next
  }
  return current
}

export function schemeLabel(id: keyof typeof SCHEME_INFO): string {
  return SCHEME_INFO[id].name
}
