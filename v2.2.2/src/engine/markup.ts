import { poolPrice } from './queries'
import type { GameCard, GameState, Player } from './types'

/** Lowest / highest markup (in $M) a player can attach to a contributed card. */
export const MARKUP_MIN = 1
export const MARKUP_MAX = 30
/** How many marked-up contributions each player may make per stage. */
export const MARKUPS_PER_STAGE = 4

export function isValidMarkup(amount: number): boolean {
  return Number.isInteger(amount) && amount >= MARKUP_MIN && amount <= MARKUP_MAX
}

export function markupsLeft(player: Player): number {
  return Math.max(0, MARKUPS_PER_STAGE - (player.markupsUsed ?? 0))
}

/** The markup listed on a pool card (0 if none), regardless of who is looking. */
export function listedMarkup(state: GameState, card: GameCard): number {
  return state.poolMarkup?.[card.uid]?.amount ?? 0
}

/** The markup `buyer` would actually pay for `card`. Sellers never pay themselves. */
export function markupFor(state: GameState, buyer: Player, card: GameCard): number {
  const entry = state.poolMarkup?.[card.uid]
  if (!entry || entry.sellerId === buyer.id) return 0
  return entry.amount
}

/** Pool price (after discounts) plus any markup owed to the seller. */
export function poolTotal(state: GameState, buyer: Player, card: GameCard): number {
  return poolPrice(state, buyer, card) + markupFor(state, buyer, card)
}
