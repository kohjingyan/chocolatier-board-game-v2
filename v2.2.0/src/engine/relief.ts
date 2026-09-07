import { RELIEF_CASH, RELIEF_PENALTY, RELIEF_REP, RELIEF_RES } from './data'
import { cleanProduction } from './income'
import { masteryScore, repP, resP } from './queries'
import type { GameState, Player, ReliefKind } from './types'

export function standingScore(state: GameState, player: Player): number {
  return (
    player.cash +
    5 * resP(player) +
    4 * repP(player) +
    3 * cleanProduction(state, player) +
    masteryScore(state, player)
  )
}

function sortKey(state: GameState, player: Player): number[] {
  return [standingScore(state, player), player.lastIncome, repP(player), resP(player)]
}

function sameKey(state: GameState, a: Player, b: Player): boolean {
  const left = sortKey(state, a)
  const right = sortKey(state, b)
  return left.every((n, i) => n === right[i])
}

export function reliefRanks(state: GameState): Record<string, number> {
  const ordered = [...state.players].sort((a, b) => {
    const left = sortKey(state, a)
    const right = sortKey(state, b)
    for (let i = 0; i < left.length; i += 1) {
      if (right[i] !== left[i]) return right[i] - left[i]
    }
    return a.id.localeCompare(b.id)
  })
  const ranks: Record<string, number> = {}
  let i = 0
  while (i < ordered.length) {
    let j = i + 1
    while (j < ordered.length && sameKey(state, ordered[i], ordered[j])) j += 1
    const worst = j
    for (let k = i; k < j; k += 1) ranks[ordered[k].id] = worst
    i = j
  }
  return ranks
}

export function reliefAllowance(rank: number): number {
  if (rank >= 3) return 1
  return 0
}

export function reliefStage(state: GameState): 1 | 2 {
  return Math.min(2, Math.max(1, state.stage)) as 1 | 2
}

export function reliefValue(kind: Exclude<ReliefKind, 'discard'>, stage: 1 | 2): number {
  if (kind === 'res') return RELIEF_RES[stage]
  if (kind === 'rep') return RELIEF_REP[stage]
  return RELIEF_CASH[stage]
}

export function reliefPenaltyFor(stage: 1 | 2): number {
  return RELIEF_PENALTY[stage]
}

export function publicIngredients(state: GameState) {
  return state.publicDiscard.filter((c) => c.kind === 'ingredient')
}
