import { hazardousPenalty, premiumPay, recipeById } from './data'
import { recipeUsesFamily, repLevel, resLevel, trackIncome } from './queries'
import type { Effect, Factory, GameState, IncomeBreakdown, Player, Recipe } from './types'

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

function ingredientBonuses(factory: Factory): number {
  let extra = 0
  for (const card of factory.ingredients) extra += premiumPay(card)
  return extra
}

export function factoryIncome(state: GameState, player: Player, factory: Factory): number {
  if (!factory.recipeId) return 0
  if (state.effects.some((e) => e.kind === 'secret_project' && e.playerId === player.id)) return 0
  if (state.effects.some((e) => e.kind === 'defamation_idle' && e.playerId === player.id)) return 0
  if (state.effects.some((e) => e.kind === 'labour' && e.playerId === player.id && e.remaining === 1)) {
    return 0
  }
  const recipe = recipeById(factory.recipeId)
  const printed = printedIncome(state, recipe, state.effects)
  if (printed === 0 && state.effects.some((e) => e.kind === 'embargo' && recipeUsesFamily(recipe, e.family))) {
    return 0
  }
  let raw = printed + ingredientBonuses(factory)
  raw -= (factory.hazardousSlots ?? 0) * hazardousPenalty(state.stage)
  return Math.max(0, raw)
}

export function playerFactoryIncome(state: GameState, player: Player): number {
  let factories = 0
  for (const f of player.factories) factories += factoryIncome(state, player, f)
  if (state.effects.some((e) => e.kind === 'labour' && e.playerId === player.id && e.remaining > 1)) {
    factories *= 2
  }
  return factories
}

export function playerIncome(state: GameState, player: Player): IncomeBreakdown {
  const factories = playerFactoryIncome(state, player)
  const research = trackIncome(resLevel(player))
  const reputation = trackIncome(repLevel(player))
  const total = factories + research + reputation
  return { factories, research, reputation, masteries: 0, total }
}

export function cleanProduction(state: GameState, player: Player): number {
  const clean: GameState = {
    ...state,
    effects: state.effects.filter(
      (e) =>
        e.kind !== 'price_gouging' &&
        e.kind !== 'embargo' &&
        e.kind !== 'labour' &&
        e.kind !== 'secret_project' &&
        e.kind !== 'defamation_idle',
    ),
  }
  const factories = clean.players
    .find((p) => p.id === player.id)!
    .factories.reduce((sum, f) => sum + factoryIncome(clean, player, f), 0)
  return factories + trackIncome(resLevel(player)) + trackIncome(repLevel(player))
}
