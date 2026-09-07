import type { GameState } from './types'

export function nextRand(state: GameState): number {
  state.seed |= 0
  state.seed = (state.seed + 0x6d2b79f5) | 0
  let t = Math.imul(state.seed ^ (state.seed >>> 15), 1 | state.seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function shuffle<T>(items: T[], state: GameState): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRand(state) * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

export function roll2d6(state: GameState): number {
  return 1 + Math.floor(nextRand(state) * 6) + 1 + Math.floor(nextRand(state) * 6)
}
