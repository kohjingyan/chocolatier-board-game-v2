import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { flushBots } from '../src/engine/bot'
import { setBotTrainingMode } from '../src/engine/botWeights'
import {
  applyReinforce,
  beginEpisode,
  clonePolicy,
  currentPolicy,
  mutatePolicy,
  POLICY_DIM,
  randomPolicy,
  setPolicy,
  setSeatPolicies,
  takeEpisode,
  type BotPolicy,
} from '../src/engine/botPolicy'
import { resetUid } from '../src/engine/data'
import { initialState, reduce } from '../src/engine/game'
import { finalScores } from '../src/engine/queries'

const gens = Number(process.env.BOT_TRAIN_GENS ?? 10)
const games = Number(process.env.BOT_TRAIN_GAMES ?? 80)
const popSize = Number(process.env.BOT_TRAIN_POP ?? 8)
const elites = Number(process.env.BOT_TRAIN_ELITE ?? 2)
const lr = Number(process.env.BOT_TRAIN_LR ?? 0.02)
const policyPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/engine/bot-policy.json')

function mulberry(seed: number) {
  let x = seed | 0
  return () => {
    x = (x + 0x6d2b79f5) | 0
    let t = Math.imul(x ^ (x >>> 15), 1 | x)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shufflePick(rand: () => number, n: number, k: number) {
  const ids = Array.from({ length: n }, (_, i) => i)
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = ids[i]
    ids[i] = ids[j]
    ids[j] = tmp
  }
  return ids.slice(0, k)
}

function play(pop: BotPolicy[], seats: number[], seed: number) {
  resetUid()
  beginEpisode()
  const ids = ['p1', 'p2', 'p3', 'p4']
  const map: Record<string, BotPolicy> = {}
  for (let i = 0; i < 4; i += 1) map[ids[i]] = pop[seats[i]]
  setSeatPolicies(map)
  let state = initialState()
  state.seed = seed
  state = reduce(state, {
    type: 'START',
    config: {
      seats: [
        { name: 'A', isBot: true },
        { name: 'B', isBot: true },
        { name: 'C', isBot: true },
        { name: 'D', isBot: true },
      ],
    },
  })
  state = flushBots(state)
  setSeatPolicies(null)
  const steps = takeEpisode()
  if (state.phase !== 'game_over') return { ok: false as const, steps, seats }
  const rows = finalScores(state)
  const scores: Record<string, number> = {}
  for (const row of rows) scores[row.id] = row.total
  const ranked = [...rows].sort((a, b) => b.total - a.total)
  return { ok: true as const, steps, seats, scores, ranked, totals: rows.map((r) => r.total) }
}

function main() {
  setBotTrainingMode(true)
  const rand = mulberry(20260828)
  const seedPolicy =
    currentPolicy().w.length === POLICY_DIM && currentPolicy().w.some((n) => n !== 0)
      ? clonePolicy(currentPolicy())
      : randomPolicy(7, 1.3)
  seedPolicy.temperature = 1.15
  const pop: BotPolicy[] = [seedPolicy]
  while (pop.length < popSize) {
    if (pop.length === popSize - 1) pop.push(randomPolicy(100 + pop.length, 1.35))
    else pop.push(mutatePolicy(seedPolicy, rand, 0.12))
  }

  const totalMatches = gens * games
  console.log(
    `Generational self-play: ${popSize} bots, ${games} games/gen, ${gens} gens (${totalMatches} matches)`,
  )

  for (let gen = 0; gen < gens; gen += 1) {
    const stats = pop.map(() => ({ sum: 0, n: 0, wins: 0 }))
    let finished = 0
    let bestTable = -Infinity
    for (let g = 0; g < games; g += 1) {
      const seats = shufflePick(rand, pop.length, 4)
      const result = play(pop, seats, 10_000 + gen * 1000 + g)
      if (!result.ok) continue
      finished += 1
      bestTable = Math.max(bestTable, ...result.totals)
      for (let s = 0; s < 4; s += 1) {
        const id = `p${s + 1}`
        const genome = seats[s]
        const score = result.scores[id] ?? 0
        stats[genome].sum += score
        stats[genome].n += 1
        if (result.ranked[0]?.id === id) stats[genome].wins += 1
        const mine = result.steps.filter((step) => step.playerId === id)
        pop[genome] = applyReinforce(pop[genome], mine, result.scores, lr)
      }
    }
    const rankedPop = pop
      .map((policy, i) => ({
        i,
        policy,
        avg: stats[i].n ? stats[i].sum / stats[i].n : 0,
        wins: stats[i].wins,
        n: stats[i].n,
      }))
      .sort((a, b) => b.avg - a.avg || b.wins - a.wins)
    const keep = rankedPop.slice(0, Math.max(1, elites))
    const next: BotPolicy[] = keep.map((row) => clonePolicy(row.policy))
    while (next.length < popSize) {
      const parent = keep[next.length % keep.length].policy
      next.push(mutatePolicy(parent, rand, 0.1 + gen * 0.005))
    }
    pop.splice(0, pop.length, ...next)
    const champ = rankedPop[0]
    console.log(
      `gen ${gen + 1}/${gens}  finished ${finished}/${games}  champ avg ${champ.avg.toFixed(1)}  wins ${champ.wins}/${champ.n}  table-best ${bestTable.toFixed(0)}`,
    )
    const checkpoint = clonePolicy(pop[0])
    checkpoint.temperature = 0.9
    checkpoint.games = (seedPolicy.games ?? 0) + (gen + 1) * games
    writeFileSync(policyPath, `${JSON.stringify({ ...checkpoint, dim: POLICY_DIM })}\n`)
  }

  const champion = clonePolicy(pop[0])
  champion.temperature = 0.9
  champion.games = (seedPolicy.games ?? 0) + gens * games
  setPolicy(champion)
  setBotTrainingMode(false)
  writeFileSync(policyPath, `${JSON.stringify({ ...champion, dim: POLICY_DIM })}\n`)
  console.log(`Wrote ${policyPath}  games=${champion.games}`)
}

main()
