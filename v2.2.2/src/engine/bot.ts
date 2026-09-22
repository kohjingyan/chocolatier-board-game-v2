import {
  discardPay,
  hazardousPenalty,
  openMarketCard,
  openMarketPay,
  RECIPES,
  RELIEF_CASH,
  RELIEF_PENALTY,
  RELIEF_REP,
  RELIEF_RES,
  REP_FACTORY_COST,
  REP_JUNIOR_COST,
  REP_SENIOR_COST,
  REP_SLOT_L1_COST,
  REP_SLOT_L2_COST,
  schemePlayCost,
} from './data'
import { canDrawScheme, reduce } from './game'
import { factoryIncome, recipePay } from './income'
import { publicIngredients, reliefStage } from './relief'
import {
  buildableOnFactory,
  canAssignRecipe,
  canObtain,
  currentVetoId,
  factoryCapacity,
  faceCost,
  finalScores,
  masteryScore,
  mostReputableId,
  ownedFamilyCount,
  ownsFamily,
  playerById,
  poolPrice,
  producedCount,
  recipeById,
  recipeRepAward,
  requiredResLevel,
  repLevel,
  repP,
  resLevel,
  resP,
  trackIncome,
  visibleCash,
} from './queries'
import {
  BOT_TEMPERATURE_SCALE,
  botStyleFor,
  botTrainingMode,
  currentBotWeights,
  deterministicBots,
  greedyBot,
  hash32,
  weightsFor,
  type BotStyle,
  type BotWeights,
} from './botWeights'
import { MARKUP_MAX, markupFor, markupsLeft, poolTotal } from './markup'
import { forceLearnedPolicy, legalBotActions, policyBotAction } from './botPolicy'
import type {
  Action,
  Factory,
  GameCard,
  GameState,
  IngredientFamily,
  MasteryId,
  Player,
  Recipe,
  SchemeId,
  SchemeTargets,
} from './types'

type Scored<T> = { item: T; score: number }

/** Rough odds a marked-up card is bought rather than discarded. */
const MARKUP_SALE_CHANCE = 0.5

function botRng(state: GameState, player: Player, lane: string): () => number {
  let x = hash32(
    `${state.seed}|${player.id}|${state.phase}|${state.round}|${state.stage}|${lane}|${state.actorIndex}|${state.logSeq}`,
  )
  return () => {
    x = Math.imul(x ^ (x >>> 16), 2246822519)
    x = Math.imul(x ^ (x >>> 13), 3266489917)
    x ^= x >>> 16
    return (x >>> 0) / 4294967296
  }
}

/**
 * One bot per game (chosen from the game seed) always plays its top-scoring option.
 * Every other bot samples from its style's temperature, so bots stop being fully predictable
 * while there is always at least one sharp opponent at the table.
 */
function isGreedySeat(state: GameState, player: Player): boolean {
  if (deterministicBots()) return true
  const bots = state.players.filter((p) => p.isBot)
  if (bots.length <= 1) return true
  const rank = (p: Player) => hash32(`${state.seed}:greedy-seat:${p.id}`)
  const greedy = bots.reduce((best, p) => (rank(p) < rank(best) ? p : best))
  return greedy.id === player.id
}

function pickScored<T>(state: GameState, player: Player, lane: string, options: Scored<T>[], temperature: number): T {
  const viable = options.filter((row) => Number.isFinite(row.score))
  const fallback = viable[0] ?? options[0]
  if (!fallback) throw new Error('pickScored needs options')
  if (viable.length === 0) return fallback.item
  const temp = temperature * BOT_TEMPERATURE_SCALE
  if (isGreedySeat(state, player) || temp <= 0.02 || viable.length === 1) {
    return viable.reduce((best, row) => (row.score > best.score ? row : best)).item
  }
  const max = Math.max(...viable.map((row) => row.score))
  const rand = botRng(state, player, lane)
  const weights = viable.map((row) => Math.exp((row.score - max) / temp))
  const sum = weights.reduce((n, w) => n + w, 0)
  let ticket = rand() * sum
  for (let i = 0; i < viable.length; i += 1) {
    ticket -= weights[i]
    if (ticket <= 0) return viable[i].item
  }
  return viable[viable.length - 1].item
}

function botLens(state: GameState, player: Player): { weights: BotWeights; style: BotStyle } {
  return { weights: weightsFor(player.id), style: botStyleFor(player.id, state.seed) }
}

export function roundsLeft(state: GameState): number {
  return Math.max(1, (3 - state.stage) * 8 + (9 - state.round))
}

function resLevelFrom(n: number): 0 | 1 | 2 | 3 {
  if (n >= 11) return 3
  if (n >= 7) return 2
  if (n >= 3) return 1
  return 0
}

function repLevelFrom(n: number): 0 | 1 | 2 | 3 {
  if (n >= 20) return 3
  if (n >= 12) return 2
  if (n >= 4) return 1
  return 0
}

const TRACK_STEPS = { res: [3, 7, 11], rep: [4, 12, 20] } as const

function levelBonus(level: number): number {
  return level === 1 ? 10 : level === 2 ? 14 : 18
}

/**
 * What reaching Research `level` is worth beyond the points themselves: the better recipes it
 * unlocks (income from the best newly available recipe, over the rounds that remain).
 */
function resUnlockValue(state: GameState, level: number, weights: BotWeights): number {
  if (level <= 0) return 0
  const best = (lvl: number) => Math.max(0, ...RECIPES.filter((r) => r.requiredRes <= lvl).map((r) => r.income))
  const delta = Math.max(0, best(level) - best(level - 1))
  return weights.researchUnlock * delta * roundsLeft(state)
}

/**
 * Levels arrive in lumps (3/7/11 Research, 4/12/20 Reputation), so a card that doesn't cross a
 * threshold still moves the bot toward one. Credit a share of the next level's payoff in
 * proportion to how much of the remaining gap this card closes.
 */
/**
 * What each Reputation level lets a bot buy (track researchers, extra slots, the extra factory),
 * counting only the perks it hasn't bought yet. This is why dropping a level costs more than its points.
 */
function repPerkValue(state: GameState, player: Player | undefined, level: number): number {
  if (!player) return 0
  let v = 0
  if (level === 1) {
    if (!player.boughtJuniorResearcher) v += 12
    if (!player.boughtRepSlot) v += 10
  } else if (level === 2) {
    if (!player.boughtSeniorResearcherL2) v += 16
    if (!player.boughtRepSlotL2) v += 10
    if (!player.boughtExtraFactory) v += 24
  } else if (level === 3) {
    if (!player.boughtSeniorResearcherL3) v += 16
  }
  return v * Math.min(1, roundsLeft(state) / 10)
}

function trackProgressValue(
  state: GameState,
  kind: 'res' | 'rep',
  have: number,
  add: number,
  weights: BotWeights,
  player?: Player,
): number {
  const steps: readonly number[] = TRACK_STEPS[kind]
  const idx = steps.findIndex((t) => t > have)
  if (idx < 0 || add <= 0) return 0
  const nextLevel = idx + 1
  const jump =
    levelBonus(nextLevel) +
    (trackIncome(nextLevel as 0 | 1 | 2 | 3) - trackIncome(idx as 0 | 1 | 2 | 3)) * roundsLeft(state) +
    (kind === 'res' ? resUnlockValue(state, nextLevel, weights) : repPerkValue(state, player, nextLevel))
  const feasible = Math.min(1, roundsLeft(state) / 10)
  return weights.trackProgress * (add / (steps[idx] - have)) * jump * feasible
}

function trackDeltaValue(state: GameState, kind: 'res' | 'rep', have: number, add: number, player?: Player): number {
  const weights = player ? weightsFor(player.id) : currentBotWeights()
  const vpEach = kind === 'res' ? 5 : 4
  const levelOf = kind === 'res' ? resLevelFrom : repLevelFrom
  const before = levelOf(have)
  const after = levelOf(have + add)
  const incomeGain = trackIncome(after) - trackIncome(before)
  let value = vpEach * add + incomeGain * roundsLeft(state)
  if (after > before) {
    value += levelBonus(after)
    for (let lvl = before + 1; lvl <= after; lvl += 1) {
      value += kind === 'res' ? resUnlockValue(state, lvl, weights) : repPerkValue(state, player, lvl)
    }
  } else {
    value += trackProgressValue(state, kind, have, add, weights, player)
  }
  return value
}

function splitLeadValue(state: GameState, mine: number, others: number[], add: number): number {
  const next = mine + add
  const bestOther = Math.max(0, ...others)
  const wasLead = mine > bestOther
  const nowLead = next > bestOther
  const wasTie = mine === bestOther && mine > 0
  const nowTie = next === bestOther && next > 0
  let raw = 0
  if (!wasLead && nowLead) raw = 25
  else if (wasTie && nowLead) raw = 25 - Math.floor(25 / 2)
  else if (!wasLead && nowTie) raw = Math.floor(25 / 2)
  if (raw === 0) return 0
  return raw * Math.min(1, 10 / roundsLeft(state))
}

function cashReserve(state: GameState, player: Player): number {
  const late = state.stage === 3 && state.round >= 6
  if (late) return 0
  return Math.min(player.cash, 3 + openMarketPay(state.stage))
}

function allIngredients(player: Player): GameCard[] {
  return [
    ...player.factories.flatMap((f) => f.ingredients),
    ...player.supply.filter((c) => c.kind === 'ingredient'),
  ]
}

function withSupply(player: Player, extra: GameCard[]): Player {
  return { ...player, supply: [...player.supply, ...extra] }
}

function withSlots(player: Player, extra: number, hazardous = false): Player {
  return {
    ...player,
    extraSlotPool: player.extraSlotPool + extra,
    extraHazardPool: player.extraHazardPool + (hazardous ? extra : 0),
  }
}

function withFactory(player: Player): Player {
  return {
    ...player,
    factories: [
      ...player.factories,
      { id: `${player.id}-bot-extra`, extraSlots: 0, hazardousSlots: 0, ingredients: [], recipeId: null },
    ],
  }
}

function ingredientIndex(pool: GameCard[]): Map<string, GameCard[]> {
  const index = new Map<string, GameCard[]>()
  for (const c of pool) {
    if (c.kind !== 'ingredient' || !c.family) continue
    const list = index.get(c.family)
    if (list) list.push(c)
    else index.set(c.family, [c])
  }
  return index
}

function pickIngredients(
  pool: GameCard[],
  recipe: Recipe,
  used: Set<string>,
  supplyIds?: Set<string>,
  index?: Map<string, GameCard[]>,
): GameCard[] | null {
  const picked: GameCard[] = []
  const lookup = index ?? ingredientIndex(pool)
  for (const fam of recipe.ingredients) {
    const options = lookup.get(fam)
    if (!options) return null
    // First best option: in Supply, then premium (same pick as a stable sort on those keys).
    let card: GameCard | null = null
    let cardSupply = 0
    for (const c of options) {
      if (used.has(c.uid) || picked.includes(c)) continue
      const inSupply = supplyIds?.has(c.uid) ? 1 : 0
      if (!card || inSupply > cardSupply || (inSupply === cardSupply && Number(c.premium) > Number(card.premium))) {
        card = c
        cardSupply = inSupply
      }
    }
    if (!card) return null
    picked.push(card)
  }
  return picked
}

type PlannedAssign = { factoryId: string; recipeId: string; cardUids: string[]; value: number }

type PlanSummary = { plan: PlannedAssign[]; income: number; filled: number; vp: number }

// Two ways to score the same plan.
//  'own'   - what the plan is worth as a permanent set-up (income x rounds left). Used to value purchases.
//  'round' - what assigning it *this round* is worth. Tearing a factory down returns its ingredients, so an
//            assignment only decides this round's payout, while a recipe's rep is a one-time award. Used when
//            deciding what to assign, which is what makes bots rotate through new recipes for rep and then
//            fall back to their best-income recipe once nothing new is left to introduce.
type PlanLens = 'own' | 'round'

const assignmentPlans = new Map<string, PlannedAssign[]>()

/**
 * Everything the planner works out is a pure function of the (immutable) game state, so results are
 * remembered per state object and dropped with it. Nothing is reused across states, which keeps every
 * valuation fresh (an older cache reused plans from earlier rounds).
 */
type PlanStats = { income: number; filled: number; vp: number }
type StateMemo = {
  plans: Map<string, PlannedAssign[]>
  stats: Map<string, PlanStats>
  utility: Map<string, number>
  repVp: Map<string, number>
  claimed: Map<string, boolean>
  produced: string | null
  planning: GameState | null
}
const stateMemos = new WeakMap<GameState, StateMemo>()

function memoFor(state: GameState): StateMemo {
  let memo = stateMemos.get(state)
  if (!memo) {
    memo = { plans: new Map(), stats: new Map(), utility: new Map(), repVp: new Map(), claimed: new Map(), produced: null, planning: null }
    stateMemos.set(state, memo)
  }
  return memo
}

function clonePlan(plan: PlannedAssign[]): PlannedAssign[] {
  return plan.map((item) => ({ ...item, cardUids: [...item.cardUids] }))
}

function producedKey(state: GameState): string {
  const memo = memoFor(state)
  if (memo.produced === null) memo.produced = RECIPES.map((r) => producedCount(state, r.id)).join('')
  return memo.produced
}

function planKeyBase(state: GameState, player: Player, lens: PlanLens): string {
  const factories = player.factories.map((f) => `${f.id}:${f.extraSlots}`).join(',')
  const rivals = state.players
    .filter((p) => p.id !== player.id)
    .map((p) => `${state.turnOrder.indexOf(p.id)}:${p.completedRecipes.length}:${p.factories.map((f) => f.recipeId ?? '-').join('/')}`)
    .join(';')
  return `${lens}|${state.turnOrder.indexOf(player.id)}|${rivals}|${player.id}|${player.extraSlotPool}|${player.extraHazardPool}|${resP(player)}|${repP(player)}|${player.mastery ?? '-'}|${player.completedRecipes.join('.')}|${player.unlicensedRecipes.join('.')}|${Object.keys(state.firstIntroducedBy).sort().join(',')}|${factories}|${producedKey(state)}|${state.playerCount}`
}

function planCacheKey(state: GameState, player: Player, lens: PlanLens): string {
  const ings = allIngredients(player)
    .map((c) => `${c.uid}:${c.family}:${c.premium ? 1 : 0}`)
    .sort()
    .join(',')
  return `${planKeyBase(state, player, lens)}|${ings}`
}

/** Same as planCacheKey but ignores which copy of a card is held: values only depend on kind, family and premium. */
function planStatsKey(state: GameState, player: Player, lens: PlanLens): string {
  const inSupply = new Set(player.supply.map((c) => c.uid))
  const ings = allIngredients(player)
    .map((c) => `${c.family}:${c.premium ? 1 : 0}:${inSupply.has(c.uid) ? 1 : 0}`)
    .sort()
    .join(',')
  return `${planKeyBase(state, player, lens)}|${ings}`
}

function familyCountsFrom(pool: GameCard[], used: Set<string>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const card of pool) {
    if (!card.family || used.has(card.uid)) continue
    counts[card.family] = (counts[card.family] ?? 0) + 1
  }
  return counts
}

function recipeNeed(recipe: Recipe): Record<string, number> {
  const need: Record<string, number> = {}
  for (const fam of recipe.ingredients) need[fam] = (need[fam] ?? 0) + 1
  return need
}

function fitsCounts(need: [string, number][], counts: Record<string, number>): boolean {
  for (const [fam, n] of need) {
    if ((counts[fam] ?? 0) < n) return false
  }
  return true
}

function planningState(state: GameState): GameState {
  const memo = memoFor(state)
  if (!memo.planning) memo.planning = buildPlanningState(state)
  return memo.planning
}

function buildPlanningState(state: GameState): GameState {
  return {
    ...state,
    effects: state.effects.filter((e) => {
      if (e.kind === 'secret_project' || e.kind === 'defamation_idle') return false
      if (e.kind === 'labour' && e.remaining <= 1) return false
      return true
    }),
  }
}

function planAssignments(state: GameState, player: Player, lens: PlanLens = 'own'): PlannedAssign[] {
  const plans = memoFor(state).plans
  const cacheKey = planCacheKey(state, player, lens)
  const cached = plans.get(cacheKey)
  if (cached) return clonePlan(cached)
  const pool = allIngredients(player)
  const supplyIds = new Set(player.supply.map((c) => c.uid))
  const poolIndex = ingredientIndex(pool)
  const factories = [...player.factories].sort((a, b) => b.extraSlots - a.extraSlots)
  const unlocked = RECIPES.filter(
    (recipe) => resLevel(player) >= requiredResLevel(recipe) || player.unlicensedRecipes.includes(recipe.id),
  ).sort((a, b) => recipePay(state, b) - recipePay(state, a) || b.ingredients.length - a.ingredients.length)
  const needs = new Map(unlocked.map((recipe) => [recipe.id, Object.entries(recipeNeed(recipe))]))
  // Most rep the remaining factories could still add: the best k unseen recipes (used to prune the 'round' search).
  const seenRecipes = new Set(player.completedRecipes)
  const repDesc = unlocked
    .filter((recipe) => !seenRecipes.has(recipe.id))
    .map((recipe) => recipeRepAward(recipe) + (recipe.id !== 'basic' && !state.firstIntroducedBy[recipe.id] ? 1 : 0))
    .sort((a, b) => b - a)
  const repTop = (k: number) => repDesc.slice(0, k).reduce((sum, n) => sum + n, 0)
  const used = new Set<string>()
  const counts: Record<string, number> = {}
  const acc: PlannedAssign[] = []
  let best: PlannedAssign[] = []
  let bestVp = -Infinity

  const consider = () => {
    const vp = planVp(state, player, acc, lens)
    if (vp > bestVp) {
      bestVp = vp
      best = acc.map((item) => ({ ...item, cardUids: [...item.cardUids] }))
    }
  }

  const rec = (idx: number, extra: number, hazard: number, leftover: Record<string, number>) => {
    consider()
    if (idx >= factories.length) return
    const factory = factories[idx]
    const fit: Recipe[] = []
    let cap = 0
    for (const recipe of unlocked) {
      if (!fitsCounts(needs.get(recipe.id)!, leftover)) continue
      const slotNeed = Math.max(0, recipe.ingredients.length - factoryCapacity(factory))
      if (slotNeed > extra) continue
      fit.push(recipe)
      cap = Math.max(cap, recipePay(state, recipe))
    }
    const incomeSoFar = acc.reduce((sum, item) => sum + item.value, 0)
    const remaining = factories.length - idx
    const optimisticVp =
      lens === 'round'
        ? roundIncomeVp(state, incomeSoFar + cap * remaining) +
          recipeRepVp(state, player, newRecipeRep(state, player, acc) + repTop(remaining)) +
          (player.mastery === 'chocolatier' ? 5 * (acc.length + remaining) : 0)
        : incomeGainVp(state, incomeSoFar + cap * remaining) + remaining * 28 + 18
    if (optimisticVp < bestVp) return

    for (const recipe of fit) {
      const cards = pickIngredients(pool, recipe, used, supplyIds, poolIndex)
      if (!cards) continue
      const need = Math.max(0, cards.length - factoryCapacity(factory))
      const hazardAdd = Math.min(need, hazard)
      for (const c of cards) used.add(c.uid)
      counts[recipe.id] = (counts[recipe.id] ?? 0) + 1
      const fake: Factory = {
        ...factory,
        recipeId: recipe.id,
        ingredients: cards,
        hazardousSlots: (factory.hazardousSlots ?? 0) + hazardAdd,
      }
      acc.push({
        factoryId: factory.id,
        recipeId: recipe.id,
        cardUids: cards.map((c) => c.uid),
        value: factoryIncome(planningState(state), player, fake),
      })
      const nextLeft = { ...leftover }
      for (const fam of recipe.ingredients) nextLeft[fam] = (nextLeft[fam] ?? 0) - 1
      rec(idx + 1, extra - need, hazard - hazardAdd, nextLeft)
      acc.pop()
      counts[recipe.id] -= 1
      if (counts[recipe.id] <= 0) delete counts[recipe.id]
      for (const c of cards) used.delete(c.uid)
    }
  }

  rec(0, player.extraSlotPool, player.extraHazardPool, familyCountsFrom(pool, used))
  const packed = packLeftoverRecipes(state, player, best)
  plans.set(cacheKey, clonePlan(packed))
  return packed
}

function packLeftoverRecipes(state: GameState, player: Player, plan: PlannedAssign[]): PlannedAssign[] {
  const packed = clonePlan(plan)
  const planned = new Set(packed.map((item) => item.factoryId))
  const used = new Set(packed.flatMap((item) => item.cardUids))
  const counts: Record<string, number> = {}
  for (const item of packed) counts[item.recipeId] = (counts[item.recipeId] ?? 0) + 1
  const unlocked = RECIPES.filter(
    (recipe) => resLevel(player) >= requiredResLevel(recipe) || player.unlicensedRecipes.includes(recipe.id),
  ).sort((a, b) => recipePay(state, b) - recipePay(state, a) || a.ingredients.length - b.ingredients.length)

  for (const factory of player.factories) {
    if (planned.has(factory.id) || factory.recipeId) continue
    const pool = player.supply.filter((c) => c.kind === 'ingredient' && !used.has(c.uid))
    let chosen: PlannedAssign | null = null
    for (const recipe of unlocked) {
      const slotNeed = Math.max(0, recipe.ingredients.length - factoryCapacity(factory))
      if (slotNeed > 0) continue
      const cards = pickIngredients(pool, recipe, new Set())
      if (!cards) continue
      const fake: Factory = { ...factory, recipeId: recipe.id, ingredients: cards }
      chosen = {
        factoryId: factory.id,
        recipeId: recipe.id,
        cardUids: cards.map((c) => c.uid),
        value: factoryIncome(planningState(state), player, fake),
      }
      break
    }
    if (!chosen) continue
    packed.push(chosen)
    planned.add(chosen.factoryId)
    for (const uid of chosen.cardUids) used.add(uid)
    counts[chosen.recipeId] = (counts[chosen.recipeId] ?? 0) + 1
  }
  return packed
}

// The first-introducer bonus goes to whoever is earliest in turn order among the players completing a recipe for
// the first time this round (awardAllRecipeRep). Rivals earlier in the order who already have it in a factory
// will take the bonus from us. Rivals later in the order can't.
function claimedEarlier(state: GameState, player: Player, recipeId: string): boolean {
  const claimed = memoFor(state).claimed
  const key = `${player.id}|${recipeId}`
  const hit = claimed.get(key)
  if (hit !== undefined) return hit
  const value = claimedEarlierUncached(state, player, recipeId)
  claimed.set(key, value)
  return value
}

function claimedEarlierUncached(state: GameState, player: Player, recipeId: string): boolean {
  const mine = state.turnOrder.indexOf(player.id)
  return state.players.some((p) => {
    if (p.id === player.id) return false
    if (state.turnOrder.indexOf(p.id) > mine) return false
    if (p.completedRecipes.includes(recipeId)) return false
    return p.factories.some((f) => f.recipeId === recipeId)
  })
}

function newRecipeRep(state: GameState, player: Player, plan: PlannedAssign[]): number {
  const seen = new Set(player.completedRecipes)
  let rep = 0
  for (const item of plan) {
    if (seen.has(item.recipeId)) continue
    seen.add(item.recipeId)
    const recipe = recipeById(item.recipeId)
    let gained = recipeRepAward(recipe)
    if (recipe.id !== 'basic' && !state.firstIntroducedBy[recipe.id] && !claimedEarlier(state, player, recipe.id)) gained += 1
    rep += gained
  }
  return rep
}

function recipeRepVp(state: GameState, player: Player, addedRep: number): number {
  if (addedRep <= 0) return 0
  const memo = memoFor(state).repVp
  const key = `${player.id}|${repP(player)}|${addedRep}`
  const hit = memo.get(key)
  if (hit !== undefined) return hit
  const value = recipeRepVpUncached(state, player, addedRep)
  memo.set(key, value)
  return value
}

function recipeRepVpUncached(state: GameState, player: Player, addedRep: number): number {
  const { weights, style } = botLens(state, player)
  const others = state.players.filter((p) => p.id !== player.id).map((p) => repP(p))
  const raw =
    trackDeltaValue(state, 'rep', repP(player), addedRep, player) + splitLeadValue(state, repP(player), others, addedRep)
  return raw * weights.recipeRepScale * style.rep
}

function planVp(state: GameState, player: Player, plan: PlannedAssign[], lens: PlanLens = 'own'): number {
  const income = plan.reduce((sum, item) => sum + item.value, 0)
  const filled = plan.length
  const idle = Math.max(0, player.factories.length - filled)
  const incomeVp = lens === 'round' ? roundIncomeVp(state, income) : incomeGainVp(state, income)
  const idleVp = lens === 'round' ? roundIncomeVp(state, 1) : incomeGainVp(state, 1)
  let vp = incomeVp - idle * idleVp + recipeRepVp(state, player, newRecipeRep(state, player, plan))
  if (player.mastery === 'chocolatier') {
    const fresh = new Set(plan.map((item) => item.recipeId))
    for (const id of player.completedRecipes) fresh.delete(id)
    vp += 5 * fresh.size
  }
  return vp
}

function currentAsPlan(state: GameState, player: Player): PlannedAssign[] {
  return player.factories
    .filter((f) => f.recipeId)
    .map((f) => ({
      factoryId: f.id,
      recipeId: f.recipeId as string,
      cardUids: f.ingredients.map((c) => c.uid),
      value: factoryIncome(planningState(state), player, f),
    }))
}

function summarizePlan(state: GameState, player: Player, lens: PlanLens = 'own'): PlanSummary {
  const plan = planAssignments(state, player, lens)
  return {
    plan,
    income: plan.reduce((sum, item) => sum + item.value, 0),
    filled: plan.length,
    vp: planVp(state, player, plan, lens),
  }
}

function currentFactoryIncome(state: GameState, player: Player): number {
  return player.factories.reduce((sum, f) => sum + factoryIncome(state, player, f), 0)
}

/** Income, filled factories and VP of the best plan, remembered per state. */
function planStats(state: GameState, player: Player, lens: PlanLens = 'own'): PlanStats {
  const stats = memoFor(state).stats
  const key = planStatsKey(state, player, lens)
  const hit = stats.get(key)
  if (hit) return hit
  const { income, filled, vp } = summarizePlan(state, player, lens)
  const value = { income, filled, vp }
  stats.set(key, value)
  return value
}

function planIncome(state: GameState, player: Player): number {
  return Math.max(currentFactoryIncome(state, player), planStats(state, player).income)
}

function planMetric(state: GameState, player: Player): number {
  return planStats(state, player).vp
}

function planBeatsCurrent(state: GameState, player: Player, plan: PlannedAssign[]): boolean {
  return planVp(state, player, plan, 'round') > planVp(state, player, currentAsPlan(state, player), 'round')
}

function planIsExecutable(_state: GameState, player: Player, plan: PlannedAssign[]): boolean {
  const have = new Set(allIngredients(player).map((c) => c.uid))
  return plan.every(
    (item) => player.factories.some((f) => f.id === item.factoryId) && item.cardUids.every((id) => have.has(id)),
  )
}

function lockedPlan(state: GameState, player: Player): PlannedAssign[] {
  const prev = assignmentPlans.get(player.id)
  if (prev && planIsExecutable(state, player, prev)) return prev
  const plan = planAssignments(state, player, 'round')
  assignmentPlans.set(player.id, plan)
  return plan
}

// Value of a single round's income. The last round also feeds the final 3x production score.
function roundIncomeVp(state: GameState, income: number): number {
  return income * (roundsLeft(state) <= 1 ? 4 : 1)
}

function incomeGainVp(state: GameState, gainPerTurn: number): number {
  return gainPerTurn * roundsLeft(state) + 3 * gainPerTurn
}

function cardUtility(state: GameState, player: Player, card: GameCard): number {
  const memo = memoFor(state).utility
  const key = `${player.id}|${card.uid}`
  const real = state.players.find((p) => p.id === player.id) === player
  if (real) {
    const hit = memo.get(key)
    if (hit !== undefined) return hit
  }
  const value = cardUtilityUncached(state, player, card)
  if (real) memo.set(key, value)
  return value
}

function cardUtilityUncached(state: GameState, player: Player, card: GameCard): number {
  if (card.kind === 'researcher') {
    const add = card.resP ?? 1
    const others = state.players.filter((p) => p.id !== player.id).map((p) => resP(p))
    return trackDeltaValue(state, 'res', resP(player), add, player) + splitLeadValue(state, resP(player), others, add)
  }
  if (card.kind === 'journalist') {
    const add = card.repP ?? 2
    const others = state.players.filter((p) => p.id !== player.id).map((p) => repP(p))
    return trackDeltaValue(state, 'rep', repP(player), add, player) + splitLeadValue(state, repP(player), others, add)
  }
  if (card.kind === 'slot') {
    const gain = planIncome(state, withSlots(player, 1)) - planIncome(state, player)
    return incomeGainVp(state, gain) - (player.extraSlotPool >= 3 ? 8 : 0)
  }
  if (card.kind === 'mastery') {
    return projectedMasteryValue(state, player, card.masteryId) - 8
  }
  const before = planMetric(state, player)
  const after = planMetric(state, withSupply(player, [card]))
  let value = after - before
  if (card.premium) value += 4
  if (after <= before) value += Math.min(6, card.cost * 0.15)
  return value
}

const pressureCache = new WeakMap<GameState, Map<string, Record<string, number>>>()

/**
 * How hard `player` should work to keep each rival from getting stronger: 1 for anyone level with
 * or behind them, rising to 2 for a rival about 100 points ahead. Stops bots feeding a runaway leader.
 */
function leaderPressure(state: GameState, player: Player): Record<string, number> {
  let byPlayer = pressureCache.get(state)
  if (!byPlayer) {
    byPlayer = new Map()
    pressureCache.set(state, byPlayer)
  }
  const cached = byPlayer.get(player.id)
  if (cached) return cached
  const rows = finalScores(state)
  const mine = rows.find((r) => r.id === player.id)?.total ?? 0
  const out: Record<string, number> = {}
  for (const row of rows) {
    if (row.id === player.id) continue
    out[row.id] = 1 + Math.min(1, Math.max(0, row.total - mine) / 100)
  }
  byPlayer.set(player.id, out)
  return out
}

function opponentCardThreat(state: GameState, player: Player, card: GameCard): number {
  const pressure = leaderPressure(state, player)
  let best = 0
  for (const opp of state.players) {
    if (opp.id === player.id) continue
    best = Math.max(best, cardUtility(state, opp, card) * (pressure[opp.id] ?? 1))
  }
  return best
}

function projectedMasteryValue(state: GameState, player: Player, id?: MasteryId): number {
  if (!id) return 0
  const projected: Player = { ...player, mastery: id }
  let value = masteryScore(state, projected)
  if (id === 'experimentalist') {
    const mine = resP(player)
    const bestOther = Math.max(0, ...state.players.filter((p) => p.id !== player.id).map((p) => resP(p)))
    if (mine <= bestOther) value += Math.max(0, 80 - (bestOther - mine) * 12)
  }
  if (id === 'brand_ambassador') {
    const mine = repP(player)
    const bestOther = Math.max(0, ...state.players.filter((p) => p.id !== player.id).map((p) => repP(p)))
    if (mine <= bestOther) value += Math.max(0, 80 - (bestOther - mine) * 10)
  }
  if (id === 'exotics_master' && resLevel(player) >= 2) value += 40
  if (id === 'chocolatier') value += 5 * Math.max(0, 6 - player.completedRecipes.length)
  return value
}

function purchasePosition(state: GameState, player: Player): number {
  const idx = state.turnOrder.indexOf(player.id)
  return idx < 0 ? state.players.length : idx
}

function maybeCallForBid(state: GameState, player: Player): Action | null {
  if (player.hasCalledBid) return null
  if (state.round === 1) return null // turn order was just freshly bid for this stage
  if (state.stage === 1) return null
  const pos = purchasePosition(state, player)
  if (pos <= 0) return null // already going first, nothing to gain
  const isLast = pos === state.playerCount - 1
  if (!isLast) return null
  const others = state.players.filter((p) => p.id !== player.id).map((p) => p.cash)
  const bestOther = Math.max(0, ...others)
  // Only worth burning the one-time call with a real cash edge over the table,
  // since a fresh bid is likely to favor whoever can outspend everyone else.
  console.log(`[bot] ${player.name} considering call-for-bid with cash ${player.cash} vs best other ${bestOther}`)
  if (player.cash < bestOther * 0.5) return null
  const { style } = botLens(state, player)
  console.log(`[bot] ${player.name} considering call-for-bid with cash ${player.cash} vs best other ${bestOther}, style.bid=${style.bid}`)
  const rand = botRng(state, player, 'call_for_bid')()
  console.log(`[bot] ${player.name} considering call-for-bid with cash ${player.cash} vs best other ${bestOther}, style.bid=${style.bid}, rand=${rand}`)
  const chance = 0.35 * style.bid
  console.log(`[bot] ${player.name} considering call-for-bid with cash ${player.cash} vs best other ${bestOther}, style.bid=${style.bid}, rand=${rand}, chance=${chance}`)
  if (rand > chance) return null
  return { type: 'CALL_FOR_BID', actorId: player.id }
}

function pickContribute(state: GameState, player: Player): string {
  const { weights, style } = botLens(state, player)
  const pos = purchasePosition(state, player)
  const early = pos === 0 || (pos === 1 && state.playerCount === 4)
  const ranked = [...player.hand].map((card) => {
    const mine = cardUtility(state, player, card)
    const price = poolPrice(state, player, card)
    const canBuy = player.cash >= price
    const threat = opponentCardThreat(state, player, card) * weights.denyWeight * style.deny
    // A late contributor is giving the card up anyway, so a card a rival will pay a markup for
    // is worth part of that markup (not all of it: the rival may discard instead).
    const revenue = early ? 0 : markupPlan(state, player, card) * MARKUP_SALE_CHANCE
    // A late contributor gives the card up, so it should not hand a rival something they badly want
    // (unless the markup pays for it).
    const score = early ? mine + (canBuy ? 5 : -18) : -mine - threat + revenue
    return { item: card.uid, score }
  })
  return pickScored(state, player, 'contribute', ranked, style.temperature)
}

/**
 * How much markup (in $M) the bot would attach to `card` if it contributed it.
 * Estimates the best opponent's surplus over simply discarding (utility - price - discard pay),
 * capped by what they can afford, and asks for a share of it. Returns 0 for no markup
 * (saves a markup slot for a better card).
 */
function markupPlan(state: GameState, player: Player, card: GameCard): number {
  if (markupsLeft(player) <= 0) return 0
  if (purchasePosition(state, player) === 0) return 0 // buys first, so nobody can pay it
  const { weights, style } = botLens(state, player)
  const paid = discardPay(state.stage)
  let room = 0
  for (const opp of state.players) {
    if (opp.id === player.id || !canObtain(opp, card)) continue
    const price = poolPrice(state, opp, card)
    if (opp.cash < price) continue
    const surplus = cardUtility(state, opp, card) - price - paid
    room = Math.max(room, Math.min(surplus, opp.cash - price))
  }
  const markup = Math.min(MARKUP_MAX, Math.floor(room * weights.markupShare * style.bid))
  return markup >= 2 ? markup : 0
}

function pickMarkup(state: GameState, player: Player, cardUid: string): number {
  const card = player.hand.find((c) => c.uid === cardUid)
  return card ? markupPlan(state, player, card) : 0
}

function pickPurchase(state: GameState, player: Player): Action {
  const { weights, style } = botLens(state, player)
  const paid = discardPay(state.stage)
  const options: Scored<Action>[] = []

  for (const card of state.pool) {
    const deny = opponentCardThreat(state, player, card) * weights.denyWeight * style.deny
    options.push({
      item: { type: 'DISCARD_POOL', cardUid: card.uid },
      score: paid + deny,
    })
    if (!canObtain(player, card)) continue
    const price = poolTotal(state, player, card)
    if (player.cash < price) continue
    const utility = cardUtility(state, player, card)
    // The markup is cash straight into a rival's pocket, which costs more than the money alone.
    // Discarding instead leaves that seller with nothing.
    const rivalPay = markupFor(state, player, card) * weights.denyWeight * style.deny
    options.push({
      item: { type: 'BUY_POOL', cardUid: card.uid },
      score: utility - price + deny - rivalPay,
    })
  }
  if (options.length === 0) return { type: 'DISCARD_POOL', cardUid: state.pool[0].uid }
  return pickScored(state, player, 'purchase', options, style.temperature * 0.8)
}

function maybeOpenMarket(state: GameState, player: Player): Action | null {
  const price = openMarketPay(state.stage)
  if (player.cash < price) return null
  const before = planStats(state, player)
  const idle = player.factories.length - before.filled
  if (idle <= 0 && player.cash < price + cashReserve(state, player)) return null

  type Cand = { item: 'cocoa' | 'sugar'; income: number; filled: number }
  const cands: Cand[] = []
  for (const item of ['cocoa', 'sugar'] as const) {
    const stock = item === 'cocoa' ? state.openCocoa : state.openSugar
    if (stock <= 0) continue
    const after = planStats(state, withSupply(player, [openMarketCard(item)]))
    cands.push({ item, income: after.income - before.income, filled: after.filled - before.filled })
  }
  cands.sort((a, b) => b.income - a.income || b.filled - a.filled)
  const best = cands[0]
  if (best && (best.income > 0 || best.filled > 0)) return { type: 'BUY_OPEN', item: best.item }

  if (idle > 0 && state.openCocoa > 0 && state.openSugar > 0 && player.cash >= price) {
    const both = withSupply(withSupply(player, [openMarketCard('cocoa')]), [openMarketCard('sugar')])
    const after = planStats(state, both)
    if (after.income > before.income || after.filled > before.filled) {
      const cocoaN = ownedFamilyCount(player, 'cocoa')
      const sugarN = ownedFamilyCount(player, 'sugar')
      if (cocoaN <= sugarN && state.openCocoa > 0) return { type: 'BUY_OPEN', item: 'cocoa' }
      if (state.openSugar > 0) return { type: 'BUY_OPEN', item: 'sugar' }
      if (state.openCocoa > 0) return { type: 'BUY_OPEN', item: 'cocoa' }
    }
  }
  return null
}

function maybeMastery(state: GameState, player: Player): Action | null {
  const { weights } = botLens(state, player)
  if (player.mastery || resLevel(player) < 3 || state.masteryMarket.length === 0) return null
  let best: GameCard | null = null
  let bestNet = 0
  for (const card of state.masteryMarket) {
    const price = faceCost(state, card)
    if (player.cash < price + (roundsLeft(state) > 3 ? 6 : 0)) continue
    const net = projectedMasteryValue(state, player, card.masteryId) - price
    if (net > bestNet) {
      bestNet = net
      best = card
    }
  }
  if (best && bestNet >= weights.masteryMargin) return { type: 'BUY_MASTERY', cardUid: best.uid }
  return null
}

function familyFactoryIncome(state: GameState, player: Player, family: IngredientFamily): number {
  return player.factories.reduce((sum, factory) => {
    if (!factory.recipeId) return sum
    const recipe = recipeById(factory.recipeId)
    if (!recipe.ingredients.includes(family)) return sum
    return sum + factoryIncome(state, player, factory)
  }, 0)
}

function specialFamilies(): IngredientFamily[] {
  return ['milk', 'matcha', 'coffee', 'almond', 'wild_berries', 'caramel', 'sea_salt', 'royal_honey']
}

function embargoFamily(state: GameState, player: Player): IngredientFamily | null {
  let best: IngredientFamily | null = null
  let bestScore = 4
  for (const family of specialFamilies()) {
    let oppLoss = 0
    for (const opp of state.players) {
      if (opp.id === player.id) continue
      oppLoss += familyFactoryIncome(state, opp, family)
    }
    const mine = familyFactoryIncome(state, player, family)
    const score = oppLoss - mine * 1.6
    if (score > bestScore) {
      bestScore = score
      best = family
    }
  }
  return best
}

function shortageFamily(state: GameState, player: Player): IngredientFamily | null {
  const families: IngredientFamily[] = [
    'cocoa',
    'sugar',
    ...specialFamilies(),
  ]
  let best: IngredientFamily | null = null
  let bestScore = 0
  for (const family of families) {
    const mine = player.supply.some((c) => c.family === family)
    if (mine && ownedFamilyCount(player, family) <= 2) continue
    let hits = 0
    for (const opp of state.players) {
      if (opp.id === player.id) continue
      if (opp.supply.some((c) => c.family === family)) hits += 1
    }
    const score = hits - (mine ? 1.5 : 0)
    if (score > bestScore) {
      bestScore = score
      best = family
    }
  }
  return best
}

function neededFamily(state: GameState, player: Player, family: IngredientFamily): number {
  const extra: GameCard = {
    uid: `bot-need-${family}`,
    kind: 'ingredient',
    name: family,
    cost: 0,
    stage: state.stage,
    family,
  }
  return planIncome(state, withSupply(player, [extra])) - planIncome(state, player)
}

function schemeTargets(state: GameState, player: Player, schemeId: string): SchemeTargets | null {
  if (
    schemeId === 'unethical_research' ||
    schemeId === 'labour_exploitation' ||
    schemeId === 'embezzlement' ||
    schemeId === 'secret_project' ||
    schemeId === 'hostile_takeover' ||
    schemeId === 'money_laundering' ||
    schemeId === 'hazardous_warehousing'
  ) {
    return {}
  }
  if (schemeId === 'black_market') {
    if (state.publicDiscard.length === 0) return null
    const card = [...state.publicDiscard].sort(
      (a, b) => cardUtility(state, player, b) - cardUtility(state, player, a),
    )[0]
    return { discardUid: card.uid }
  }
  if (schemeId === 'unlicensed_chef') {
    const have = allIngredients(player)
    let best = 'extra_dark'
    let bestScore = -99
    for (const recipe of RECIPES) {
      if (resLevel(player) >= recipe.requiredRes || player.unlicensedRecipes.includes(recipe.id)) continue
      const cards = pickIngredients(have, recipe, new Set())
      const missing = recipe.ingredients.length - (cards?.length ?? 0)
      const score = recipePay(state, recipe) * (cards ? 3 : 1) - missing * 6
      if (score > bestScore) {
        bestScore = score
        best = recipe.id
      }
    }
    return { recipeId: best }
  }
  if (schemeId === 'forced_swap') {
    let best: SchemeTargets | null = null
    let bestScore = 2
    for (const opp of state.players) {
      if (opp.id === player.id || opp.supply.length === 0) continue
      for (const mine of player.supply) {
        for (const theirs of opp.supply) {
          const payment = Math.max(0, faceCost(state, mine) - faceCost(state, theirs))
          const gain =
            cardUtility(state, player, theirs) -
            cardUtility(state, player, mine) -
            payment -
            cardUtility(state, opp, theirs) * 0.2
          if (gain > bestScore && player.cash >= payment) {
            bestScore = gain
            best = { opponentId: opp.id, ownCardUid: mine.uid, theirCardUid: theirs.uid }
          }
        }
      }
    }
    return best
  }
  if (schemeId === 'synthetic_ingredient') {
    let best: SchemeTargets | null = null
    let bestGain = 0.5
    for (const opp of state.players) {
      if (opp.id === player.id) continue
      const families = new Set<IngredientFamily>()
      for (const card of [...opp.supply, ...opp.factories.flatMap((f) => f.ingredients)]) {
        if (card.family) families.add(card.family)
      }
      for (const family of families) {
        if (!ownsFamily(opp, family)) continue
        const gain = neededFamily(state, player, family)
        if (gain > bestGain) {
          bestGain = gain
          best = { opponentId: opp.id, family }
        }
      }
    }
    return best
  }
  if (schemeId === 'artificial_shortage') {
    const family = shortageFamily(state, player)
    if (!family) return null
    return { family }
  }
  if (schemeId === 'price_gouging' || schemeId === 'embargo') {
    const family = embargoFamily(state, player)
    if (!family) return null
    return { family }
  }
  if (schemeId === 'defamation_ops') {
    const titleId = mostReputableId(state)
    if (!titleId || titleId === player.id) return null
    return {}
  }
  if (schemeId === 'double_agent') {
    const opps = state.players.filter((p) => p.id !== player.id && p.hand.length > 0)
    if (opps.length < 2 || player.hand.length < 2) return null
    const rankedOpps = [...opps].sort((a, b) => {
      const aBest = Math.max(...a.hand.map((c) => cardUtility(state, player, c)))
      const bBest = Math.max(...b.hand.map((c) => cardUtility(state, player, c)))
      return bBest - aBest
    })
    const myWorst = [...player.hand].sort((a, b) => cardUtility(state, player, a) - cardUtility(state, player, b))
    const theirBest = (p: Player) =>
      [...p.hand].sort((a, b) => cardUtility(state, player, b) - cardUtility(state, player, a))[0]
    const a = rankedOpps[0]
    const b = rankedOpps[1]
    const takeA = theirBest(a)
    const takeB = theirBest(b)
    if (!takeA || !takeB) return null
    return {
      opponentId: a.id,
      opponentId2: b.id,
      ownCardUid: myWorst[0].uid,
      ownCardUid2: myWorst[1].uid,
      theirCardUid: takeA.uid,
      theirCardUid2: takeB.uid,
    }
  }
  if (schemeId === 'press_leak') {
    const opps = state.players.filter((p) => p.id !== player.id)
    if (opps.length < 2) return null
    const ranked = [...opps].sort((a, b) => b.schemes.length - a.schemes.length)
    const a = ranked[0]
    const b = ranked[1]
    return {
      opponentId: a.id,
      opponentId2: b.id,
      theirCardUid: a.schemes.length >= 2 ? a.schemes[0].uid : undefined,
      theirCardUid2: b.schemes.length >= 2 ? b.schemes[0].uid : undefined,
    }
  }
  return {}
}

function schemeValue(state: GameState, player: Player, schemeId: SchemeId, targets: SchemeTargets): number {
  const income = currentFactoryIncome(state, player)
  const left = roundsLeft(state)
  if (schemeId === 'money_laundering') return state.stage === 1 ? 15 : state.stage === 2 ? 25 : 35
  if (schemeId === 'unethical_research') {
    const others = state.players.filter((p) => p.id !== player.id).map((p) => resP(p))
    return trackDeltaValue(state, 'res', resP(player), 1, player) + splitLeadValue(state, resP(player), others, 1)
  }
  if (schemeId === 'secret_project') {
    const others = state.players.filter((p) => p.id !== player.id).map((p) => resP(p))
    return trackDeltaValue(state, 'res', resP(player), 2, player) + splitLeadValue(state, resP(player), others, 2) - income
  }
  if (schemeId === 'labour_exploitation') return left === 1 ? income : income < 3 ? 2 : -4
  if (schemeId === 'embezzlement') {
    const tax = state.stage === 1 ? 3 : state.stage === 2 ? 6 : 9
    return state.players
      .filter((p) => p.id !== player.id)
      .reduce((sum, p) => sum + Math.min(tax, p.cash), 0)
  }
  if (schemeId === 'press_leak') {
    const opps = [targets.opponentId, targets.opponentId2]
      .map((id) => state.players.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p))
    return opps.reduce((sum, p) => sum + (p.schemes.length >= 2 ? 8 : 2), 0)
  }
  if (schemeId === 'hostile_takeover') {
    if (mostReputableId(state) === player.id) return -2
    return (state.stage <= 2 ? 2 : 3) * Math.min(3, left) + 4
  }
  if (schemeId === 'defamation_ops') {
    const titleId = mostReputableId(state)
    if (!titleId || titleId === player.id) return -99
    const stolen = 2 + Math.max(0, state.players.length - 2)
    return stolen * 4 - income
  }
  if (schemeId === 'hazardous_warehousing') {
    const gain = planIncome(state, withSlots(player, 1, true)) - planIncome(state, player)
    return incomeGainVp(state, gain) - hazardousPenalty(state.stage) * left
  }
  if (schemeId === 'black_market' && targets.discardUid) {
    const card = state.publicDiscard.find((c) => c.uid === targets.discardUid)
    return card ? cardUtility(state, player, card) : -4
  }
  if (schemeId === 'unlicensed_chef' && targets.recipeId) {
    const recipe = recipeById(targets.recipeId)
    const fake = { ...player, unlicensedRecipes: [...player.unlicensedRecipes, recipe.id] }
    return incomeGainVp(state, planIncome(state, fake) - planIncome(state, player)) + recipeRepAward(recipe)
  }
  if (schemeId === 'forced_swap' && targets.ownCardUid && targets.theirCardUid && targets.opponentId) {
    const opp = playerById(state, targets.opponentId)
    const mine = player.supply.find((c) => c.uid === targets.ownCardUid)
    const theirs = opp.supply.find((c) => c.uid === targets.theirCardUid)
    if (!mine || !theirs) return -4
    return cardUtility(state, player, theirs) - cardUtility(state, player, mine) - Math.max(0, faceCost(state, mine) - faceCost(state, theirs))
  }
  if (schemeId === 'synthetic_ingredient' && targets.family) {
    return incomeGainVp(state, neededFamily(state, player, targets.family))
  }
  if (schemeId === 'artificial_shortage' && targets.family) {
    let score = 0
    for (const p of state.players) {
      const hit = p.supply.some((c) => c.family === targets.family)
      if (!hit) continue
      score += p.id === player.id ? -cardUtility(state, player, p.supply.find((c) => c.family === targets.family)!) : 6
    }
    return score
  }
  if ((schemeId === 'price_gouging' || schemeId === 'embargo') && targets.family) {
    const turns = schemeId === 'price_gouging' ? 3 : 2
    const factor = schemeId === 'price_gouging' ? 0.5 : 1
    let score = 0
    for (const p of state.players) {
      const loss = familyFactoryIncome(state, p, targets.family) * factor * Math.min(turns, left)
      score += p.id === player.id ? -loss : loss * 0.7
    }
    return score
  }
  if (schemeId === 'double_agent' && targets.theirCardUid && targets.ownCardUid) {
    const a = state.players.find((p) => p.id === targets.opponentId)
    const b = state.players.find((p) => p.id === targets.opponentId2)
    const take =
      (a?.hand.find((c) => c.uid === targets.theirCardUid)?.cost ?? 0) +
      (b?.hand.find((c) => c.uid === targets.theirCardUid2)?.cost ?? 0)
    const give =
      (player.hand.find((c) => c.uid === targets.ownCardUid)?.cost ?? 0) +
      (player.hand.find((c) => c.uid === targets.ownCardUid2)?.cost ?? 0)
    return take - give
  }
  if (schemeId === 'veto_power') return 14
  if (schemeId === 'private_viewing') return purchasePosition(state, player) === 0 ? 1 : 11
  return 0
}

function keepScheme(state: GameState, player: Player): Action {
  const { style } = botLens(state, player)
  const draft = state.schemeDraft ?? []
  const options = draft.map((card) => {
    const targets = schemeTargets(state, player, card.schemeId) ?? {}
    const value = schemeValue(state, player, card.schemeId, targets)
    const hold = card.schemeId === 'veto_power' && !player.schemes.some((c) => c.schemeId === 'veto_power') ? 9 : 0
    return { item: card.uid, score: value * style.scheme + hold }
  })
  return { type: 'KEEP_SCHEME', cardUid: pickScored(state, player, 'keep-scheme', options, style.temperature) }
}

const REP_FLOORS = [0, 4, 12, 20]

/** Reputation the bot can spend right now without dropping a level. */
function repSpendable(player: Player): number {
  return repP(player) - REP_FLOORS[repLevel(player)]
}

/** VP the bot gives up by spending `cost` Reputation: the points, progress, level perks and lead it loses. */
function repSpendCost(state: GameState, player: Player, cost: number): number {
  const have = repP(player)
  const after = Math.max(0, have - cost)
  const lost = have - after
  if (lost <= 0) return 0
  const others = state.players.filter((p) => p.id !== player.id).map((p) => repP(p))
  return trackDeltaValue(state, 'rep', after, lost, player) + splitLeadValue(state, after, others, lost)
}

/**
 * Reputation is what unlocks Research purchases, slots and discounts, so bots only spend it on
 * schemes while it is spare: never by dropping a level, and not at all while still climbing to Level 1.
 * In the last few rounds the levels stop paying back, so the points may be spent freely.
 */
function canSpendRep(state: GameState, player: Player, cost: number): boolean {
  if (repP(player) < cost) return false
  if (roundsLeft(state) <= 4) return true
  if (repLevel(player) === 0 && roundsLeft(state) > 6) return false
  return repSpendable(player) >= cost
}

function pickScheme(state: GameState, player: Player): Action {
  const { weights, style } = botLens(state, player)
  if (state.schemeDraft?.length) return keepScheme(state, player)
  const options: Scored<Action>[] = [{ item: { type: 'SKIP_SCHEME' }, score: 0 }]
  if (!player.schemePlayedThisRound) {
    for (const card of player.schemes) {
      if (card.schemeId === 'veto_power' || card.schemeId === 'private_viewing') continue
      const cost = schemePlayCost(card.schemeId, state.playerCount, state.stage)
      if (!canSpendRep(state, player, cost)) continue
      const targets = schemeTargets(state, player, card.schemeId)
      if (!targets) continue
      const score = schemeValue(state, player, card.schemeId, targets) * style.scheme - repSpendCost(state, player, cost)
      options.push({ item: { type: 'PLAY_SCHEME', cardUid: card.uid }, score })
    }
  }
  const holdsPlayable = player.schemes.some((c) => c.schemeId !== 'veto_power' && c.schemeId !== 'private_viewing')
  if (
    canDrawScheme(state, player) &&
    player.schemes.length < 2 &&
    !holdsPlayable &&
    canSpendRep(state, player, 1) &&
    repLevel(player) >= 1 &&
    repSpendable(player) - 1 >= 2 &&
    roundsLeft(state) > 4 &&
    (state.stage >= 2 || repP(player) >= 6)
  ) {
    options.push({ item: { type: 'DRAW_SCHEME' }, score: 3 * style.scheme })
  }
  const picked = pickScored(state, player, 'scheme', options, style.temperature)
  if (picked.type === 'PLAY_SCHEME') {
    const row = options.find((o) => o.item.type === 'PLAY_SCHEME' && o.item.cardUid === picked.cardUid)
    // Extra caution when the spend would leave Reputation within a couple of points of a level.
    const cost = schemePlayCost(
      player.schemes.find((c) => c.uid === picked.cardUid)?.schemeId ?? 'money_laundering',
      state.playerCount,
      state.stage,
    )
    const thin = repSpendable(player) - cost < 2
    if (!row || row.score < weights.schemeMargin + (thin ? 3 : 0)) return { type: 'SKIP_SCHEME' }
  }
  return picked
}

function schemeHarmToMe(state: GameState, player: Player, schemeId: SchemeId): number {
  if (schemeId === 'embargo' || schemeId === 'price_gouging') {
    let exposed = 0
    for (const family of specialFamilies()) exposed += familyFactoryIncome(state, player, family)
    return schemeId === 'embargo' ? exposed * 2 : exposed * 1.5
  }
  if (schemeId === 'artificial_shortage') {
    return player.supply.filter((c) => c.kind === 'ingredient').length >= 2 ? 8 : 2
  }
  if (schemeId === 'embezzlement') {
    const tax = state.stage === 1 ? 3 : state.stage === 2 ? 6 : 9
    return Math.min(tax, player.cash)
  }
  if (schemeId === 'press_leak') return player.schemes.length >= 2 ? 8 : 1
  if (schemeId === 'defamation_ops') {
    if (mostReputableId(state) === player.id) return 12
    return 5
  }
  if (schemeId === 'hostile_takeover') return mostReputableId(state) === player.id ? 10 : 3
  if (schemeId === 'forced_swap' || schemeId === 'synthetic_ingredient') return player.supply.length > 0 ? 7 : 2
  if (schemeId === 'double_agent') return 6
  if (schemeId === 'money_laundering' || schemeId === 'labour_exploitation') return 0
  return 4
}

function pickVeto(state: GameState, vetoer: Player): Action {
  const pending = state.pendingScheme
  if (!pending) return { type: 'DECLINE_VETO' }
  const veto = vetoer.schemes.find((c) => c.schemeId === 'veto_power')
  if (!veto || repP(vetoer) < 1 || pending.playerId === vetoer.id) return { type: 'DECLINE_VETO' }
  const harm = schemeHarmToMe(state, vetoer, pending.schemeId)
  if (harm >= 8) return { type: 'VETO', cardUid: veto.uid }
  return { type: 'DECLINE_VETO' }
}

function pickPrivateViewing(state: GameState, player: Player): Action {
  const { weights, style } = botLens(state, player)
  const pv = player.schemes.find((c) => c.schemeId === 'private_viewing')
  const cost = schemePlayCost('private_viewing', state.playerCount, state.stage)
  const pass: Action = { type: 'PASS_PRIVATE_VIEWING', actorId: player.id }
  if (!pv || player.schemePlayedThisRound || !canSpendRep(state, player, cost) || purchasePosition(state, player) === 0) {
    return pass
  }
  let best = 0
  for (const card of state.pool) {
    const price = poolTotal(state, player, card)
    if (player.cash < price) continue
    best = Math.max(best, cardUtility(state, player, card) - price)
  }
  const play: Action = { type: 'PLAY_PRIVATE_VIEWING', cardUid: pv.uid, actorId: player.id }
  return pickScored<Action>(
    state,
    player,
    'pv',
    [
      { item: play, score: best - weights.pvMargin },
      { item: pass, score: 0 },
    ],
    style.temperature,
  )
}

function pickBid(state: GameState, player: Player): number {
  const { weights, style } = botLens(state, player)
  const cash = player.cash
  if (cash <= 0) return 0

  const rows = [...player.hand]
    .map((card) => ({
      card,
      utility: cardUtility(state, player, card),
      price: poolPrice(state, player, card),
    }))
    .sort((a, b) => b.utility - a.utility)
  const target = rows.find((row) => row.utility >= 6 && cash >= row.price) ?? rows.find((row) => cash >= row.price) ?? rows[0]
  const wantPrice = target?.price ?? openMarketPay(state.stage)
  const wantUtility = target?.utility ?? 0
  const keepFor = target ? Math.min(cash, wantPrice) : Math.min(cash, openMarketPay(state.stage))
  const surplus = Math.max(0, cash - keepFor)
  const stageBoost = state.stage === 1 ? 1.2 : state.stage === 2 ? 1.08 : 1
  const fraction = weights.bidCashFraction * style.bid * stageBoost
  const rebid = state.phase === 'bid_tie'

  let amount: number
  let cap: number
  if (rebid) {
    if (surplus <= 0) {
      if (cash < wantPrice) {
        const keepOpen = Math.min(cash, openMarketPay(state.stage))
        cap = Math.max(0, cash - keepOpen)
        amount = Math.round(cash * fraction * 0.5) + Math.round(weights.bidTieBonus)
      } else {
        return 0
      }
    } else {
      cap = surplus
      amount = Math.round(surplus * Math.min(0.85, fraction + 0.15)) + Math.round(weights.bidTieBonus)
    }
  } else {
    const opening = state.round === 1 ? weights.bidOpening : Math.max(2, weights.bidOpening * 0.45)
    cap = surplus
    const floor = cash >= 8 ? Math.round(weights.bidMin * style.bid) : 0
    amount = Math.round(cash * fraction + opening + wantUtility * weights.bidUtilityScale)
    amount = Math.max(amount, floor)

    // Read the table: guess what the strongest rival will bid from their (public) starting cash,
    // then either edge just past it when that's cheap, or stop overpaying when we'd win easily.
    let rivalTop = 0
    for (const rival of state.players) {
      if (rival.id === player.id) continue
      const rivalCash = visibleCash(state, rival)
      const guess = Math.round(rivalCash * weights.bidCashFraction * stageBoost + opening)
      rivalTop = Math.max(rivalTop, Math.min(rivalCash, guess))
    }
    const edge = Math.max(3, wantUtility * weights.bidRivalEdge)
    if (amount <= rivalTop) {
      if (rivalTop + 1 - amount <= edge && rivalTop + 1 <= cap) amount = rivalTop + 1
    } else if (amount > rivalTop + 2) {
      amount = Math.max(floor, rivalTop + 2)
    }
  }

  amount = Math.min(cap, Math.max(0, amount))
  if (!isGreedySeat(state, player)) {
    const jitter = Math.floor(botRng(state, player, 'bid-jitter')() * 3) - 1
    amount = Math.min(cap, Math.max(0, amount + jitter))
  }
  return amount
}

function shouldTearFactory(factory: Factory, plan: PlannedAssign[]): boolean {
  const want = plan.find((item) => item.factoryId === factory.id)
  if (!factory.recipeId) return false
  if (!want) return true
  return want.recipeId !== factory.recipeId
}

function pickAssignment(state: GameState, player: Player): Action {
  const specialist = player.supply.find((c) => c.kind === 'researcher' || c.kind === 'journalist' || c.kind === 'slot')
  if (specialist) {
    if (specialist.kind === 'journalist' && resLevel(player) === 0 && player.supply.some((c) => c.kind === 'researcher')) {
      const researcher = player.supply.find((c) => c.kind === 'researcher')
      if (researcher) return { type: 'ASSIGN_SPECIALIST', cardUid: researcher.uid }
    }
    return { type: 'ASSIGN_SPECIALIST', cardUid: specialist.uid }
  }

  const reserve = cashReserve(state, player)
  const affordable = (cost: number) => player.cash >= cost + reserve
  const resGain = (add: number) => trackDeltaValue(state, 'res', resP(player), add, player)

  if (!player.boughtJuniorResearcher && repLevel(player) >= 1 && affordable(REP_JUNIOR_COST) && resGain(1) > REP_JUNIOR_COST) {
    return { type: 'BUY_TRACK_RESEARCHER', kind: 'junior' }
  }
  if (!player.boughtSeniorResearcherL2 && repLevel(player) >= 2 && affordable(REP_SENIOR_COST) && resGain(2) > REP_SENIOR_COST) {
    return { type: 'BUY_TRACK_RESEARCHER', kind: 'senior_l2' }
  }
  if (!player.boughtSeniorResearcherL3 && repLevel(player) >= 3 && affordable(REP_SENIOR_COST) && resGain(2) > REP_SENIOR_COST) {
    return { type: 'BUY_TRACK_RESEARCHER', kind: 'senior_l3' }
  }
  if (!player.boughtRepSlot && repLevel(player) >= 1 && affordable(REP_SLOT_L1_COST)) {
    const gain = planIncome(state, withSlots(player, 1)) - planIncome(state, player)
    if (incomeGainVp(state, gain) > REP_SLOT_L1_COST + 2) return { type: 'BUY_EXTRA_SLOT', track: 1 }
  }
  if (!player.boughtRepSlotL2 && repLevel(player) >= 2 && affordable(REP_SLOT_L2_COST)) {
    const gain = planIncome(state, withSlots(player, 1)) - planIncome(state, player)
    if (incomeGainVp(state, gain) > REP_SLOT_L2_COST + 2) return { type: 'BUY_EXTRA_SLOT', track: 2 }
  }
  if (!player.boughtExtraFactory && repLevel(player) >= 2 && affordable(REP_FACTORY_COST)) {
    const gain = planIncome(state, withFactory(player)) - planIncome(state, player)
    if (incomeGainVp(state, gain) > REP_FACTORY_COST + 4) return { type: 'BUY_EXTRA_FACTORY' }
  }

  const plan = lockedPlan(state, player)
  const rebuild = planBeatsCurrent(state, player, plan)

  if (rebuild) {
    for (const factory of player.factories) {
      if (shouldTearFactory(factory, plan)) {
        return { type: 'TEAR_DOWN', factoryId: factory.id }
      }
    }
  }

  for (const item of plan) {
    const factory = player.factories.find((f) => f.id === item.factoryId)
    if (!factory || factory.recipeId) continue
    let uids = item.cardUids
    const missing = uids.filter((id) => !player.supply.some((c) => c.uid === id))
    if (missing.length > 0) {
      const alt = pickIngredients(player.supply, recipeById(item.recipeId), new Set())
      if (alt) {
        uids = alt.map((c) => c.uid)
      } else {
        const blocker = player.factories.find((f) => f.ingredients.some((c) => missing.includes(c.uid)))
        if (blocker) {
          const blockerWant = plan.find((row) => row.factoryId === blocker.id)
          if (blockerWant && blocker.recipeId === blockerWant.recipeId) continue
          return { type: 'TEAR_DOWN', factoryId: blocker.id }
        }
        continue
      }
    }
    const cards = uids.map((id) => player.supply.find((c) => c.uid === id)!)
    const check = canAssignRecipe(state, player, factory, cards)
    if (!check.ok && check.reason.includes('slots') && player.extraSlotPool > 0) {
      const hazardCost = player.extraHazardPool >= player.extraSlotPool ? hazardousPenalty(state.stage) * roundsLeft(state) : 0
      // The planner already priced the slot (and any hazard penalty) into item.value. A rep-driven item is chosen for
      // its one-time rep, so don't reject it for low income; that would leave a torn-down factory and a rebuild loop.
      const repDriven = !player.completedRecipes.includes(item.recipeId)
      if (repDriven || item.value * roundsLeft(state) > hazardCost) return { type: 'MOVE_SLOTS', factoryId: factory.id, delta: 1 }
    }
    if (check.ok) return { type: 'ASSIGN_RECIPE', factoryId: factory.id, cardUids: uids }
  }

  for (const factory of player.factories) {
    if (factory.recipeId) continue
    const options = buildableOnFactory(state, player, factory)
    if (options.length === 0) continue
    const pick = options[0]
    const prev = assignmentPlans.get(player.id) ?? []
    assignmentPlans.set(player.id, [
      ...prev,
      {
        factoryId: factory.id,
        recipeId: pick.recipe.id,
        cardUids: pick.cards.map((c) => c.uid),
        value: factoryIncome(planningState(state), player, { ...factory, recipeId: pick.recipe.id, ingredients: pick.cards }),
      },
    ])
    return { type: 'ASSIGN_RECIPE', factoryId: factory.id, cardUids: pick.cards.map((c) => c.uid) }
  }

  assignmentPlans.delete(player.id)
  return { type: 'FINISH_ASSIGNMENT' }
}

function pickRelief(state: GameState, picker: Player): Action {
  const stage = reliefStage(state)
  const taken = state.reliefPicks[picker.id] ?? []
  const max = state.reliefMax[picker.id] ?? 0
  if (taken.length >= max) return { type: 'SKIP_RELIEF', actorId: picker.id }
  const penalty = RELIEF_PENALTY[stage]
  const left = roundsLeft(state)

  const options: { kind: Action['type'] extends never ? never : 'CHOOSE_RELIEF'; score: number; payload: Action }[] = []

  if (!taken.includes('res')) {
    const add = RELIEF_RES[stage]
    const others = state.players.filter((p) => p.id !== picker.id).map((p) => resP(p))
    const score = trackDeltaValue(state, 'res', resP(picker), add, picker) + splitLeadValue(state, resP(picker), others, add) - penalty
    options.push({
      kind: 'CHOOSE_RELIEF',
      score,
      payload: { type: 'CHOOSE_RELIEF', kind: 'res', actorId: picker.id },
    })
  }
  if (!taken.includes('rep')) {
    const add = RELIEF_REP[stage]
    const others = state.players.filter((p) => p.id !== picker.id).map((p) => repP(p))
    const score = trackDeltaValue(state, 'rep', repP(picker), add, picker) + splitLeadValue(state, repP(picker), others, add) - penalty
    options.push({
      kind: 'CHOOSE_RELIEF',
      score,
      payload: { type: 'CHOOSE_RELIEF', kind: 'rep', actorId: picker.id },
    })
  }
  if (!taken.includes('cash')) {
    const cash = RELIEF_CASH[stage]
    const spendPower = left > 8 ? cash * 0.7 : cash
    options.push({
      kind: 'CHOOSE_RELIEF',
      score: spendPower - penalty,
      payload: { type: 'CHOOSE_RELIEF', kind: 'cash', actorId: picker.id },
    })
  }
  if (!taken.includes('discard')) {
    for (const card of publicIngredients(state)) {
      const gain = cardUtility(state, picker, card)
      options.push({
        kind: 'CHOOSE_RELIEF',
        score: gain - penalty,
        payload: { type: 'CHOOSE_RELIEF', kind: 'discard', discardUid: card.uid, actorId: picker.id },
      })
    }
  }

  const scored: Scored<Action>[] = options.map((row) => ({ item: row.payload, score: row.score }))
  scored.push({ item: { type: 'SKIP_RELIEF', actorId: picker.id }, score: 0 })
  const picked = pickScored(state, picker, 'relief', scored, botStyleFor(picker.id, state.seed).temperature * 0.5)
  if (picked.type === 'CHOOSE_RELIEF') {
    const row = options.find(
      (o) =>
        o.payload.type === 'CHOOSE_RELIEF' &&
        o.payload.kind === picked.kind &&
        o.payload.discardUid === picked.discardUid,
    )
    if (!row || row.score < weightsFor(picker.id).reliefMargin) return { type: 'SKIP_RELIEF', actorId: picker.id }
  }
  return picked
}

function firstUnfinishedId(state: GameState, done: (id: string) => boolean): string | undefined {
  for (const id of state.turnOrder.length ? state.turnOrder : state.players.map((p) => p.id)) {
    if (!done(id)) return id
  }
  return undefined
}

export function heuristicBotAction(state: GameState): Action | null {
  if (state.phase === 'curtain' && state.curtainPlayerId) {
    const p = playerById(state, state.curtainPlayerId)
    if (!p.isBot) return null
    return { type: 'ACK_CURTAIN' }
  }
  if (state.pendingScheme?.awaitingTargets) {
    const caster = playerById(state, state.pendingScheme.playerId)
    if (!caster.isBot) return null
    const targets = schemeTargets(state, caster, state.pendingScheme.schemeId)
    if (!targets) return { type: 'SKIP_SCHEME' }
    return { type: 'CONFIRM_SCHEME_TARGETS', targets }
  }
  if (state.pendingScheme) {
    const vetoId = currentVetoId(state)
    if (!vetoId) return { type: 'DECLINE_VETO' }
    const vetoer = playerById(state, vetoId)
    if (!vetoer.isBot) return null
    return pickVeto(state, vetoer)
  }
  const allBots = state.players.every((p) => p.isBot)
  if (state.phase === 'bid_reveal') return allBots ? { type: 'ACK_BIDS' } : null
  if (state.phase === 'dice_tie' || state.phase === 'relief_dice') return allBots ? { type: 'ROLL_DICE' } : null
  if (state.phase === 'income') return allBots ? { type: 'ACK_INCOME' } : null
  if (state.phase === 'relief') {
    const id =
      state.playMode === 'online'
        ? state.players.find(
            (p) => p.isBot && (state.reliefPicks[p.id]?.length ?? 0) < (state.reliefMax[p.id] ?? 0),
          )?.id
        : state.reliefQueue[state.reliefIndex]
    if (!id) return null
    const picker = playerById(state, id)
    if (!picker.isBot) return null
    return pickRelief(state, picker)
  }

  const actorId =
    state.phase === 'bid' || state.phase === 'bid_tie'
      ? (state.phase === 'bid_tie' ? state.tieIds : state.players.map((p) => p.id)).find(
          (id) => state.bids[id] === undefined,
        )
      : state.phase === 'contribute'
        ? firstUnfinishedId(state, (id) => Boolean(state.contributed[id]))
        : state.phase === 'private_viewing'
          ? firstUnfinishedId(state, (id) => state.pvQueue.includes(id) || state.pvPassed.includes(id))
          : state.phase === 'assignment' && state.playMode === 'online'
            ? state.players.find((p) => p.isBot && !state.assignmentDone[p.id])?.id
            : state.turnOrder[state.actorIndex]
  if (!actorId) return null
  const player = playerById(state, actorId)
  if (!player.isBot) return null

  if (state.phase === 'bid' || state.phase === 'bid_tie') {
    return { type: 'BID', amount: pickBid(state, player), actorId: player.id }
  }
  if (state.phase === 'contribute') {
    const call = maybeCallForBid(state, player)
    if (call) return call
    const cardUid = pickContribute(state, player)
    const markup = pickMarkup(state, player, cardUid)
    return { type: 'CONTRIBUTE', cardUid, actorId: player.id, ...(markup > 0 ? { markup } : {}) }
  }
  if (state.phase === 'private_viewing') return pickPrivateViewing(state, player)
  if (state.phase === 'purchase') {
    const mastery = maybeMastery(state, player)
    if (mastery) return mastery
    const market = maybeOpenMarket(state, player)
    if (market) return market
    return pickPurchase(state, player)
  }
  if (state.phase === 'scheme') return pickScheme(state, player)
  if (state.phase === 'assignment') {
    const action = pickAssignment(state, player)
    return action ? { ...action, actorId: player.id } : null
  }
  return null
}

export function botAction(state: GameState): Action | null {
  if (greedyBot() && !botTrainingMode() && !forceLearnedPolicy()) return heuristicBotAction(state)
  const listed = legalBotActions(state)
  if (listed && !state.pendingScheme) {
    if (state.phase === 'assignment') {
      const action = pickAssignment(state, listed.player)
      return action ? { ...action, actorId: listed.player.id } : null
    }
    if (state.phase === 'purchase') {
      const mastery = maybeMastery(state, listed.player)
      if (mastery) return mastery
      const market = maybeOpenMarket(state, listed.player)
      if (market) return market
      return pickPurchase(state, listed.player)
    }
  }
  return policyBotAction(state, botTrainingMode())
}

export function flushBots(state: GameState): GameState {
  assignmentPlans.clear()
  let current = state
  let lastKey = ''
  let repeats = 0
  for (let i = 0; i < 40000; i += 1) {
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