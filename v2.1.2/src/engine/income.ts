import { premiumPay, recipeById } from './data'
import {
  highestRepLevel,
  highestResLevel,
  recipeUsesFamily,
  repLevel,
  resLevel,
  trackIncome,
} from './queries'
import type {
  Effect,
  Factory,
  GameState,
  IncomeBreakdown,
  Player,
  Recipe,
} from './types'

export function recipePay(state: GameState, recipe: Recipe): number {
  return state.incomeOverrides?.[recipe.id] ?? recipe.income
}

function printedIncome(state: GameState, recipe: Recipe, effects: Effect[]): number {
  if (effects.some((e) => e.kind === 'embargo' && recipeUsesFamily(recipe, e.family))) {
    return 0
  }
  let value = recipePay(state, recipe)
  if (effects.some((e) => e.kind === 'price_gouging' && recipeUsesFamily(recipe, e.family))) {
    value = Math.floor(value / 2)
  }
  return value
}

function ingredientBonuses(factory: Factory, player: Player): number {
  let extra = 0
  for (const card of factory.ingredients) {
    extra += premiumPay(card)
    if (player.mastery === 'chocolatier' && card.family === 'cocoa') extra += 3
    if (
      player.mastery === 'gourmet_pantry' &&
      (card.family === 'strawberry' ||
        card.family === 'sea_salt' ||
        card.family === 'wild_berries' ||
        card.family === 'caramel')
    ) {
      extra += 4
    }
  }
  return extra
}

function productMultiplier(player: Player, recipe: Recipe): number {
  const c = player.masteryChoices
  if (player.mastery === 'heritage_line') {
    if (recipe.tier === 1 && c.t1 === recipe.id) return 2
    if (recipe.tier === 2 && c.t2 === recipe.id) return 2
  }
  if (player.mastery === 'exotics_master' && recipe.tier === 3) {
    const best = bestTierRecipe(player, 3)
    if (best === recipe.id) return 2
  }
  return 1
}

function productAdd(player: Player, recipe: Recipe): number {
  const c = player.masteryChoices
  if (player.mastery !== 'jack_of_all_trades') return 0
  if (recipe.tier === 1 && c.t1 === recipe.id) return 3
  if (recipe.tier === 2 && c.t2 === recipe.id) return 6
  if (recipe.tier === 3 && c.t3 === recipe.id) return 9
  return 0
}

export function bestTierRecipe(player: Player, tier: 1 | 2 | 3): string | undefined {
  let bestId: string | undefined
  let best = -1
  for (const f of player.factories) {
    if (!f.recipeId) continue
    const r = recipeById(f.recipeId)
    if (r.tier !== tier) continue
    const pay = r.income
    if (pay > best) {
      best = pay
      bestId = r.id
    }
  }
  return bestId
}

export function factoryIncome(state: GameState, player: Player, factory: Factory): number {
  if (!factory.recipeId) return 0
  if (state.effects.some((e) => e.kind === 'overworked_disable')) return 0
  if (state.effects.some((e) => e.kind === 'secret_project' && e.playerId === player.id)) return 0
  const recipe = recipeById(factory.recipeId)
  const printed = printedIncome(state, recipe, state.effects)
  if (printed === 0 && state.effects.some((e) => e.kind === 'embargo' && recipeUsesFamily(recipe, e.family))) {
    return 0
  }
  const raw = (printed + ingredientBonuses(factory, player) + productAdd(player, recipe)) * productMultiplier(player, recipe)
  return raw
}

export function playerIncome(state: GameState, player: Player): IncomeBreakdown {
  let factories = 0
  for (const f of player.factories) factories += factoryIncome(state, player, f)
  if (state.effects.some((e) => e.kind === 'labour' && e.playerId === player.id)) {
    factories *= 2
  }
  if (state.effects.some((e) => e.kind === 'overworked_double')) {
    factories *= 2
  }
  const research = trackIncome(resLevel(player))
  const reputation = trackIncome(repLevel(player))
  let masteries = 0
  if (player.mastery === 'experimentalist') {
    const top = highestResLevel(state)
    const mine = resLevel(player)
    masteries += mine > 0 && mine === top && state.players.filter((p) => resLevel(p) === top).length === 1 ? 25 : 10
  }
  if (player.mastery === 'brand_ambassador') {
    const top = highestRepLevel(state)
    const mine = repLevel(player)
    masteries += mine > 0 && mine === top && state.players.filter((p) => repLevel(p) === top).length === 1 ? 25 : 10
  }
  const total = factories + research + reputation + masteries
  return { factories, research, reputation, masteries, total }
}
