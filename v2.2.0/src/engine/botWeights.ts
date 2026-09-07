export type BotWeights = {
  bidCashFraction: number
  bidOpening: number
  bidUtilityScale: number
  bidMin: number
  bidTieBonus: number
  denyWeight: number
  schemeMargin: number
  pvMargin: number
  openMarketMargin: number
  masteryMargin: number
  reliefMargin: number
}

export type BotStyle = {
  id: string
  bid: number
  scheme: number
  deny: number
  temperature: number
}

export const DEFAULT_BOT_WEIGHTS: BotWeights = {
  bidCashFraction: 0.22,
  bidOpening: 5,
  bidUtilityScale: 0.08,
  bidMin: 4,
  bidTieBonus: 2,
  denyWeight: 0.45,
  schemeMargin: 1,
  pvMargin: 12,
  openMarketMargin: 0,
  masteryMargin: 8,
  reliefMargin: 2,
}

export const BOT_WEIGHT_BOUNDS: { [K in keyof BotWeights]: [number, number] } = {
  bidCashFraction: [0.08, 0.42],
  bidOpening: [2, 10],
  bidUtilityScale: [0.02, 0.2],
  bidMin: [1, 8],
  bidTieBonus: [0, 5],
  denyWeight: [0.15, 0.9],
  schemeMargin: [-2, 8],
  pvMargin: [6, 20],
  openMarketMargin: [-4, 8],
  masteryMargin: [0, 20],
  reliefMargin: [-4, 8],
}

export const BOT_STYLES: BotStyle[] = [
  { id: 'tycoon', bid: 1.35, scheme: 0.75, deny: 1.15, temperature: 0.22 },
  { id: 'schemer', bid: 1.05, scheme: 1.45, deny: 0.85, temperature: 0.4 },
  { id: 'miser', bid: 0.88, scheme: 0.7, deny: 1.3, temperature: 0.18 },
  { id: 'wildcard', bid: 1.2, scheme: 1.2, deny: 1.0, temperature: 0.7 },
]

export const NEUTRAL_STYLE: BotStyle = {
  id: 'neutral',
  bid: 1,
  scheme: 1,
  deny: 1,
  temperature: 0.28,
}

let override: BotWeights | null = null
let seatOverrides: Record<string, BotWeights> | null = null
let training = false

export function setBotWeights(weights: BotWeights | null) {
  override = weights
}

export function setSeatBotWeights(map: Record<string, BotWeights> | null) {
  seatOverrides = map
}

export function setBotTrainingMode(on: boolean) {
  training = on
}

export function botTrainingMode() {
  return training
}

export function clampBotWeights(weights: BotWeights): BotWeights {
  const next = { ...weights }
  for (const key of Object.keys(BOT_WEIGHT_BOUNDS) as (keyof BotWeights)[]) {
    const [lo, hi] = BOT_WEIGHT_BOUNDS[key]
    next[key] = Math.min(hi, Math.max(lo, next[key]))
  }
  return next
}

export function mutateBotWeights(weights: BotWeights, rand: () => number, scale = 0.12): BotWeights {
  const next = { ...weights }
  for (const key of Object.keys(BOT_WEIGHT_BOUNDS) as (keyof BotWeights)[]) {
    const [lo, hi] = BOT_WEIGHT_BOUNDS[key]
    const span = hi - lo
    next[key] += (rand() * 2 - 1) * span * scale
  }
  return clampBotWeights(next)
}

export function botStyleFor(playerId: string, seed: number): BotStyle {
  if (training) return NEUTRAL_STYLE
  const n = Math.abs(hash32(`${seed}:${playerId}`))
  return BOT_STYLES[n % BOT_STYLES.length]
}

export function greedyBot(): boolean {
  return typeof process !== 'undefined' && Boolean(process.env.VITEST)
}

export function hash32(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

let trained: Partial<BotWeights> = {}

export function loadTrainedWeights(partial: Partial<BotWeights>) {
  trained = partial
}

export function currentBotWeights(): BotWeights {
  return clampBotWeights({ ...DEFAULT_BOT_WEIGHTS, ...trained, ...override })
}

export function weightsFor(playerId: string): BotWeights {
  const seated = seatOverrides?.[playerId]
  return seated ? clampBotWeights(seated) : currentBotWeights()
}
