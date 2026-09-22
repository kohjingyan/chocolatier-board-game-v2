import { CARD_FACE, recipeById, RECIPES, slotFace } from './data'

export { recipeById }
import type {
  Effect,
  Factory,
  GameCard,
  GameState,
  IngredientFamily,
  Player,
  Recipe,
} from './types'

export function playerById(state: GameState, id: string): Player {
  const p = state.players.find((x) => x.id === id)
  if (!p) throw new Error(`Missing player ${id}`)
  return p
}

export function repP(p: Player): number {
  return Math.max(0, p.assignedRepP + p.earnedRecipeRep + (p.reliefRepP ?? 0) - p.spentRep)
}

export function repLevel(p: Player): 0 | 1 | 2 | 3 {
  const r = repP(p)
  if (r >= 20) return 3
  if (r >= 12) return 2
  if (r >= 4) return 1
  return 0
}

export function resP(p: Player): number {
  return p.assignedResP + (p.reliefResP ?? 0)
}

export function resLevel(p: Player): 0 | 1 | 2 | 3 {
  const r = resP(p)
  if (r >= 11) return 3
  if (r >= 7) return 2
  if (r >= 3) return 1
  return 0
}

export function trackIncome(level: 0 | 1 | 2 | 3): number {
  if (level === 1) return 1
  if (level === 2) return 3
  if (level === 3) return 6
  return 0
}

export function naturalMostReputableId(state: GameState): string | null {
  const scores = state.players.map((p) => ({ id: p.id, r: repP(p) }))
  const eligible = scores.filter((x) => x.r >= 4)
  if (eligible.length === 0) return null

  const current = state.mostReputableId
  const currentScore = current ? (scores.find((s) => s.id === current)?.r ?? 0) : 0
  if (current && currentScore >= 4) {
    const ahead = eligible.filter((x) => x.r > currentScore)
    if (ahead.length === 0) return current
    const best = Math.max(...ahead.map((x) => x.r))
    const usurpers = ahead.filter((x) => x.r === best)
    return usurpers.length === 1 ? usurpers[0].id : current
  }

  const top = Math.max(...eligible.map((x) => x.r))
  const leaders = eligible.filter((x) => x.r === top)
  return leaders.length === 1 ? leaders[0].id : null
}

export function mostReputableId(state: GameState): string | null {
  const takeover = state.effects?.find((e) => e.kind === 'hostile_takeover')
  if (takeover && takeover.kind === 'hostile_takeover') return takeover.playerId
  return naturalMostReputableId(state)
}

export function bidsHidden(state: GameState): boolean {
  if (state.phase === 'bid' || state.phase === 'bid_tie') return true
  return state.phase === 'curtain' && (state.resumePhase === 'bid' || state.resumePhase === 'bid_tie')
}

export function visibleCash(state: GameState, player: Player): number {
  if (!bidsHidden(state)) return player.cash
  const bid = state.bids[player.id]
  return bid === undefined ? player.cash : player.cash + bid
}

export function mrDiscount(stage: number): number {
  if (stage <= 2) return 2
  return 3
}

export function trackPercentOff(
  family: IngredientFamily | undefined,
  resLvl: number,
  repLvl: number,
): { res: boolean; rep: boolean } {
  if (!family) return { res: false, rep: false }
  const coffeeAlmond = family === 'coffee' || family === 'almond'
  const berryCaramel = family === 'wild_berries' || family === 'caramel'
  const honey = family === 'royal_honey'
  const res =
    (coffeeAlmond && resLvl >= 1) || (berryCaramel && resLvl >= 2) || (honey && resLvl >= 3)
  const rep =
    (coffeeAlmond && repLvl >= 1) || (berryCaramel && repLvl >= 2) || (honey && repLvl >= 3)
  return { res, rep }
}

export function faceCost(state: GameState, card: GameCard): number {
  const named = state.costOverrides?.[card.name]
  if (named !== undefined) return named
  if (card.kind === 'mastery') {
    const group = state.costOverrides?.Masteries
    if (group !== undefined) return group
    return CARD_FACE.Masteries
  }
  if (card.kind === 'slot' && !card.hazardous) return slotFace(card.stage || 1)
  return CARD_FACE[card.name] ?? card.cost
}

export function catalogCost(state: GameState, name: string, printed: number): number {
  return state.costOverrides?.[name] ?? printed
}

export function poolPrice(state: GameState, player: Player, card: GameCard): number {
  const face = faceCost(state, card)
  const mr = mostReputableId(state) === player.id ? mrDiscount(state.stage) : 0
  const { res, rep } = trackPercentOff(card.family, resLevel(player), repLevel(player))
  const pct = Math.floor(face * 0.25)
  return Math.max(0, face - mr - (res ? pct : 0) - (rep ? pct : 0))
}

export function canObtain(player: Player, card: GameCard): boolean {
  if (card.kind === 'mastery') return resLevel(player) >= 3 && !player.mastery
  return true
}

export function factoryCapacity(f: Factory): number {
  return 3 + f.extraSlots
}

export function ownedFamilyCount(player: Player, family: IngredientFamily): number {
  let n = countFamily(player.supply, family)
  for (const f of player.factories) n += countFamily(f.ingredients, family)
  return n
}

export function countFamily(cards: GameCard[], family: IngredientFamily): number {
  return cards.filter((c) => c.family === family).length
}

export function matchesRecipe(cards: GameCard[], recipe: Recipe): boolean {
  if (cards.length !== recipe.ingredients.length) return false
  const need = new Map<IngredientFamily, number>()
  for (const fam of recipe.ingredients) need.set(fam, (need.get(fam) ?? 0) + 1)
  const have = new Map<IngredientFamily, number>()
  for (const c of cards) {
    if (!c.family) return false
    have.set(c.family, (have.get(c.family) ?? 0) + 1)
  }
  if (need.size !== have.size) return false
  for (const [fam, n] of need) {
    if ((have.get(fam) ?? 0) !== n) return false
  }
  return true
}

export function findMatchingRecipe(cards: GameCard[]): Recipe | null {
  return RECIPES.find((r) => matchesRecipe(cards, r)) ?? null
}

export function pickIngredientsForRecipe(supply: GameCard[], recipe: Recipe): GameCard[] | null {
  const used = new Set<string>()
  const picked: GameCard[] = []
  for (const fam of recipe.ingredients) {
    const card = supply.find((c) => c.kind === 'ingredient' && c.family === fam && !used.has(c.uid))
    if (!card) return null
    used.add(card.uid)
    picked.push(card)
  }
  return picked
}

export function buildableOnFactory(
  state: GameState,
  player: Player,
  factory: Factory,
): { recipe: Recipe; cards: GameCard[] }[] {
  const out: { recipe: Recipe; cards: GameCard[] }[] = []
  for (const recipe of RECIPES) {
    const cards = pickIngredientsForRecipe(player.supply, recipe)
    if (!cards) continue
    const check = canAssignRecipe(state, player, factory, cards)
    if (check.ok) out.push({ recipe, cards })
  }
  return out.sort((a, b) => b.recipe.income - a.recipe.income)
}

export function producedCount(state: GameState, recipeId: string): number {
  let n = 0
  for (const p of state.players) {
    for (const f of p.factories) {
      if (f.recipeId === recipeId) n += 1
    }
  }
  return n
}

export function recipeRepAward(recipe: Recipe): number {
  const n = recipe.ingredients.length
  if (n === 3) return 1
  if (n === 4) return 2
  if (n === 5) return 3
  if (n === 6) return 6
  return 0
}

export function requiredResLevel(recipe: Recipe): 0 | 1 | 2 | 3 {
  return recipe.requiredRes
}

export function canAssignRecipe(
  _state: GameState,
  player: Player,
  factory: Factory,
  cards: GameCard[],
): { ok: true; recipe: Recipe } | { ok: false; reason: string } {
  if (factory.ingredients.length > 0 || factory.recipeId) {
    return { ok: false, reason: 'Tear down this factory first.' }
  }
  const recipe = findMatchingRecipe(cards)
  if (!recipe) return { ok: false, reason: 'Those cards are not a valid recipe.' }
  if (cards.length > factoryCapacity(factory)) {
    return { ok: false, reason: 'Not enough ingredient slots on this factory.' }
  }
  const need = requiredResLevel(recipe)
  const unlocked = resLevel(player) >= need || player.unlicensedRecipes.includes(recipe.id)
  if (!unlocked) return { ok: false, reason: `Requires Research Level ${need}.` }
  return { ok: true, recipe }
}

export function ownsFamily(player: Player, family: IngredientFamily): boolean {
  if (player.supply.some((c) => c.family === family)) return true
  return player.factories.some((f) => f.ingredients.some((c) => c.family === family))
}

export function ownedFamilies(player: Player): IngredientFamily[] {
  const fams = new Set<IngredientFamily>()
  for (const card of player.supply) {
    if (card.family) fams.add(card.family)
  }
  for (const fam of uniqueFactoryFamilies(player)) fams.add(fam)
  return [...fams]
}

export function currentActor(state: GameState): Player {
  return playerById(state, state.turnOrder[state.actorIndex])
}

export function otherPlayersInOrder(state: GameState, exceptId: string): string[] {
  return state.turnOrder.filter((id) => id !== exceptId)
}

export function currentVetoId(state: GameState): string | null {
  if (!state.pendingScheme || state.pendingScheme.awaitingTargets) return null
  const others = otherPlayersInOrder(state, state.pendingScheme.playerId)
  return others[state.vetoIndex] ?? null
}

export function recipeUsesFamily(recipe: Recipe, family: IngredientFamily): boolean {
  return recipe.ingredients.includes(family)
}

export function activeEffect<T extends Effect['kind']>(
  effects: Effect[],
  kind: T,
): Extract<Effect, { kind: T }> | undefined {
  return effects.find((e) => e.kind === kind) as Extract<Effect, { kind: T }> | undefined
}

export function uniqueFactoryFamilies(player: Player): IngredientFamily[] {
  const fams = new Set<IngredientFamily>()
  for (const f of player.factories) {
    for (const c of f.ingredients) {
      if (c.family) fams.add(c.family)
    }
  }
  return [...fams]
}

export function factoryIncomeForScore(player: Player): number {
  return player.lastFactoryIncome ?? player.lastBreakdown?.factories ?? 0
}

export function masteryScore(state: GameState, player: Player): number {
  if (!player.mastery) return 0
  if (player.mastery === 'chocolatier') return 5 * player.completedRecipes.length
  if (player.mastery === 'exotics_master') {
    return player.factories.some((f) => f.recipeId && recipeById(f.recipeId).requiredRes >= 3) ? 120 : 0
  }
  if (player.mastery === 'heritage_line') {
    let sum = 0
    for (const f of player.factories) {
      if (!f.recipeId) continue
      const recipe = recipeById(f.recipeId)
      if (recipe.requiredRes <= 1) sum += recipePaySafe(state, recipe)
    }
    return 6 * sum
  }
  if (player.mastery === 'masterchef') return 15 * uniqueFactoryFamilies(player).length
  if (player.mastery === 'experimentalist') {
    const mine = resP(player)
    const others = state.players.filter((p) => p.id !== player.id)
    return others.every((p) => resP(p) < mine) && mine > 0 ? 120 : 0
  }
  if (player.mastery === 'brand_ambassador') {
    const mine = repP(player)
    const others = state.players.filter((p) => p.id !== player.id)
    return others.every((p) => repP(p) < mine) && mine > 0 ? 120 : 0
  }
  const factory = factoryIncomeForScore(player)
  const top = Math.max(0, ...state.players.map((p) => factoryIncomeForScore(p)))
  const sole = state.players.filter((p) => factoryIncomeForScore(p) === top).length === 1
  return factory + (factory > 0 && factory === top && sole ? 50 : 0)
}

function recipePaySafe(state: GameState, recipe: Recipe): number {
  return state.incomeOverrides?.[recipe.id] ?? recipe.income
}

export function finalScores(state: GameState) {
  const resp = state.players.map((p) => ({ id: p.id, v: resP(p) }))
  const repp = state.players.map((p) => ({ id: p.id, v: repP(p) }))
  const resBonus = splitBonus(resp)
  const repBonus = splitBonus(repp)
  return state.players.map((p) => {
    const cash = p.cash
    const research = 5 * resP(p)
    const reputation = 4 * repP(p)
    const production = 3 * p.lastIncome
    const masteries = masteryScore(state, p)
    const bonus = (resBonus[p.id] ?? 0) + (repBonus[p.id] ?? 0)
    const relief = p.reliefPenalty ?? 0
    return {
      id: p.id,
      name: p.name,
      cash,
      research,
      reputation,
      production,
      masteries,
      bonus,
      relief,
      total: cash + research + reputation + production + masteries + bonus - relief,
      lastIncome: p.lastIncome,
      resP: resP(p),
      repP: repP(p),
    }
  })
}

function splitBonus(rows: { id: string; v: number }[]): Record<string, number> {
  const max = Math.max(0, ...rows.map((r) => r.v))
  const winners = rows.filter((r) => r.v === max && max > 0)
  const out: Record<string, number> = {}
  if (winners.length === 0) return out
  const share = Math.floor(25 / winners.length)
  for (const w of winners) out[w.id] = share
  return out
}

export function recipeName(id: string): string {
  return recipeById(id).name
}
