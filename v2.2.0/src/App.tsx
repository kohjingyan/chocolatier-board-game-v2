import { useEffect, useMemo, useRef, useState } from 'react'
import { flushBots } from './engine/bot'
import { HoverTip, IngredientsGuide, KindIcon, RecipeNeeds, cardTooltip, schemeTooltip } from './cards'
import { HowToPlay } from './HowToPlay'
import { OnlineEntry, RoomLobby } from './Lobby'
import {
  CARD_CATALOG,
  INGREDIENT_LABEL,
  MASTERY_INFO,
  RECIPES,
  RELIEF_CASH,
  RELIEF_PENALTY,
  RELIEF_REP,
  RELIEF_RES,
  MASTERY_COST,
  openMarketPay,
  REP_FACTORY_COST,
  REP_JUNIOR_COST,
  REP_SENIOR_COST,
  REP_SLOT_L1_COST,
  REP_SLOT_L2_COST,
  SCHEME_INFO,
  SLOT_FACE_BY_STAGE,
  STAGE_INGREDIENTS,
  discardPay,
  ensureUidAtLeast,
  schemePlayCost,
} from './engine/data'
import { publicIngredients, reliefStage } from './engine/relief'
import { filterStateForPlayer, isHiddenCard } from './engine/filterState'
import { canDrawScheme, canPlayerAct, initialState, reduce, requiredActorId, viewingPlayerId } from './engine/game'
import { playerIncome, recipePay } from './engine/income'
import {
  buildableOnFactory,
  canAssignRecipe,
  canObtain,
  catalogCost,
  currentActor,
  currentVetoId,
  faceCost,
  factoryCapacity,
  finalScores,
  findMatchingRecipe,
  mostReputableId,
  ownedFamilies,
  ownsFamily,
  playerById,
  poolPrice,
  visibleCash,
  recipeById,
  repLevel,
  repP,
  resLevel,
  resP,
} from './engine/queries'
import type { Action, GameCard, GameState, IngredientFamily, Player, ReliefKind, SchemeTargets } from './engine/types'
import {
  clearCachedRoom,
  connectRoom,
  createRoomCode,
  isRoomCode,
  normalizeRoomCode,
  readCachedRoom,
  writeCachedRoom,
} from './net/client'
import type { ClientMessage, RoomSnapshot } from './net/protocol'

const STORAGE = 'chocolatier-v2.2.1-playtest'
const INCOME_STORAGE = 'chocolatier-v2.2.1-income-overrides'
const COST_STORAGE = 'chocolatier-v2.2.1-cost-overrides'

function migrateFirstIntroduced(state: GameState): Record<string, string> {
  const current = { ...(state.firstIntroducedBy ?? {}) }
  const legacy = (state as GameState & { firstIntroduced?: string[] }).firstIntroduced
  if (!Array.isArray(legacy)) return current
  for (const id of legacy) {
    if (current[id]) continue
    const owners = (state.players ?? []).filter((p) => p.completedRecipes.includes(id))
    if (owners.length === 1) current[id] = owners[0].id
  }
  return current
}

function loadStoredRecord(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, number>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadIncomeOverrides(): Record<string, number> {
  return loadStoredRecord(INCOME_STORAGE)
}

function loadCostOverrides(): Record<string, number> {
  return loadStoredRecord(COST_STORAGE)
}

function syncUids(state: GameState) {
  let max = 0
  const eat = (s: string) => {
    const m = s.match(/(\d+)$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  for (const p of state.players) {
    for (const c of [...p.hand, ...p.supply, ...p.factories.flatMap((f) => f.ingredients)]) eat(c.uid)
    for (const s of p.schemes) eat(s.uid)
  }
  for (const c of [...state.pool, ...state.publicDiscard, ...state.leftoverDiscard, ...state.stageDeck, ...state.masteryMarket]) eat(c.uid)
  for (const s of [...state.schemeDeck, ...state.schemeDiscard, ...(state.schemeDraft ?? [])]) eat(s.uid)
  ensureUidAtLeast(max)
}

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (raw) {
      const state = { ...initialState(), ...JSON.parse(raw) } as GameState
      if (!state.effects) state.effects = []
      state.firstIntroducedBy = migrateFirstIntroduced(state)
      if (!state.players) state.players = []
      if (!state.stageDeck) state.stageDeck = []
      if (!state.dicePrefix) state.dicePrefix = []
      if (!state.diceSuffix) state.diceSuffix = []
      if (!state.diceBlock) state.diceBlock = []
      if (!state.incomeOverrides) state.incomeOverrides = {}
      if (!state.costOverrides) state.costOverrides = {}
      if (!state.playMode) state.playMode = 'hotseat'
      if (!state.masteryMarket) state.masteryMarket = []
      if (!state.pvQueue) state.pvQueue = []
      if (!state.pvPassed) state.pvPassed = []
      if (state.schemeDraft === undefined) state.schemeDraft = null
      if (!state.reliefRanks) state.reliefRanks = {}
      if (!state.reliefMax) state.reliefMax = {}
      if (!state.reliefPicks) state.reliefPicks = {}
      if (!state.reliefQueue) state.reliefQueue = []
      if (state.reliefIndex === undefined) state.reliefIndex = 0
      state.incomeOverrides = { ...loadIncomeOverrides(), ...state.incomeOverrides }
      state.costOverrides = { ...loadCostOverrides(), ...state.costOverrides }
      for (const p of state.players) {
        if (p.boughtRepSlotL2 === undefined) p.boughtRepSlotL2 = false
        if (p.extraHazardPool === undefined) p.extraHazardPool = 0
        if (p.boughtJuniorResearcher === undefined) p.boughtJuniorResearcher = false
        if (p.boughtSeniorResearcherL2 === undefined) p.boughtSeniorResearcherL2 = false
        if (p.boughtSeniorResearcherL3 === undefined) p.boughtSeniorResearcherL3 = false
        if (p.lastFactoryIncome === undefined) p.lastFactoryIncome = 0
        for (const f of p.factories) {
          if (f.hazardousSlots === undefined) f.hazardousSlots = 0
        }
        if (p.reliefResP === undefined) p.reliefResP = 0
        if (p.reliefRepP === undefined) p.reliefRepP = 0
        if (p.reliefPenalty === undefined) p.reliefPenalty = 0
      }
      syncUids(state)
      return state
    }
  } catch {
    /* ignore */
  }
  const fresh = initialState()
  fresh.incomeOverrides = loadIncomeOverrides()
  fresh.costOverrides = loadCostOverrides()
  return fresh
}

function dispatch(state: GameState, action: Action): GameState {
  return flushBots(reduce(state, action))
}

function money(n: number) {
  return `$${n}M`
}

function CardView(props: {
  card: GameCard
  state?: GameState
  selected?: boolean
  locked?: boolean
  price?: number
  testId?: string
  onClick?: () => void
}) {
  const tip = cardTooltip(props.card)
  const face = props.state ? faceCost(props.state, props.card) : props.card.cost
  return (
    <HoverTip text={tip}>
      <button
        type="button"
        data-testid={props.testId}
        className={`card ${props.selected ? 'selected' : ''} ${props.locked ? 'locked' : ''}`}
        onClick={props.onClick}
        disabled={!props.onClick}
      >
        <div className="card-top">
          <KindIcon kind={props.card.kind} family={props.card.family} premium={props.card.premium} />
          <div className="kind">{props.card.kind}</div>
        </div>
        <b>{props.card.name}</b>
        <div className="cost">
          Face {money(face)}
          {props.price !== undefined ? ` · Pay ${money(props.price)}` : ''}
          {props.card.premium ? ' · Premium' : ''}
        </div>
      </button>
    </HoverTip>
  )
}

function Setup({
  onStart,
}: {
  onStart: (seats: { name: string; isBot: boolean }[]) => void
}) {
  const [count, setCount] = useState(4)
  const [seats, setSeats] = useState([
    { name: 'Amelie', isBot: false },
    { name: 'Bruno', isBot: true },
    { name: 'Chiara', isBot: true },
    { name: 'Dorian', isBot: true },
  ])
  return (
    <div className="setup panel">
      <div className="brand">Playtest table</div>
      <h1>Chocolatier</h1>
      <p className="tiny">
        3 stages, 8 rounds each. Build factories, climb Research and Reputation, and finish with the
        highest net worth. New to the game? Read <b>How to play</b> below before you open the
        atelier.
      </p>
      <label>
        Players
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        >
          {[3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {seats.slice(0, count).map((seat, i) => (
        <div className="seat" key={i}>
          <input
            value={seat.name}
            onChange={(e) => {
              const next = [...seats]
              next[i] = { ...next[i], name: e.target.value }
              setSeats(next)
            }}
          />
          <select
            value={seat.isBot ? 'bot' : 'human'}
            onChange={(e) => {
              const next = [...seats]
              next[i] = { ...next[i], isBot: e.target.value === 'bot' }
              setSeats(next)
            }}
          >
            <option value="human">Human</option>
            <option value="bot">Bot</option>
          </select>
        </div>
      ))}
      <div className="row" style={{ marginTop: '1rem' }}>
        <button
          type="button"
          data-testid="start-game"
          onClick={() => onStart(seats.slice(0, count))}
        >
          Open the atelier
        </button>
      </div>
    </div>
  )
}

function handLine(cards: GameCard[]) {
  if (cards.length === 0) return 'empty'
  if (cards.every(isHiddenCard)) return `${cards.length} hidden`
  return cards.map((c) => c.name).join(', ')
}

function PlayerRail({ state, selfId }: { state: GameState; selfId?: string | null }) {
  const actor = selfId ?? viewingPlayerId(state)
  return (
    <aside className="rail">
      <div className="brand">The floor</div>
      <h1>Chocolatier</h1>
      <div className="meta">
        Stage {state.stage} · Round {state.round}/8
        <br />
        Open market: {state.openCocoa} cocoa · {state.openSugar} sugar
        <br />
        Scheme deck: {state.schemeDeck.length}
        <br />
        Masteries: {state.masteryMarket.map((c) => c.name).join(', ') || 'sold out'}
      </div>
      {state.players.map((p, i) => {
        const order = state.turnOrder.indexOf(p.id) + 1
        const mine = Boolean(selfId && p.id === selfId)
        return (
          <div key={p.id} className={`player-card ${actor === p.id ? 'active' : ''}`}>
            <div className="who">
              <b>
                {p.name} {p.isBot ? '· bot' : ''}
                {mine ? ' · you' : ''}
              </b>
              <span className="tag">{order > 0 ? `#${order}` : `Seat ${i + 1}`}</span>
            </div>
            <div>
              {money(visibleCash(state, p))} · Res {resP(p)} (L{resLevel(p)}) · Rep {repP(p)} (L{repLevel(p)})
            </div>
            {mostReputableId(state) === p.id && <span className="title-chip">Most Reputable</span>}
            {p.mastery && (
              <HoverTip text={MASTERY_INFO[p.mastery].text}>
                <div className="tiny">{MASTERY_INFO[p.mastery].name}</div>
              </HoverTip>
            )}
            <div className="tiny">
              <b>Supply</b>{' '}
              {p.supply.length > 0 ? p.supply.map((c) => c.name).join(', ') : 'empty'}
            </div>
            <div className="tiny" data-testid={mine ? 'own-rail-hand' : undefined}>
              <b>{mine ? 'Your hand' : 'Hand'}</b> {handLine(p.hand)}
            </div>
            {mine && p.schemes.length > 0 && (
              <div className="tiny">
                <b>Schemes</b> {p.schemes.map((c) => c.name).join(', ')}
              </div>
            )}
            <div className="tiny">
              {p.factories.map((f) => (
                <div key={f.id}>
                  <b>{f.recipeId ? recipeById(f.recipeId).name : 'Idle factory'}</b>
                  {f.ingredients.length > 0 ? ` — ${f.ingredients.map((c) => c.name).join(', ')}` : ''}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </aside>
  )
}

function OwnHandDock({ state, viewerId }: { state: GameState; viewerId: string | null }) {
  if (!viewerId || state.phase === 'curtain' || state.phase === 'game_over') return null
  const player = playerById(state, viewerId)
  if (player.isBot) return null
  return (
    <div className="hand-dock" data-testid="own-hand">
      <div className="tiny">
        <b>Your hand</b>
        {player.hand.length === 0 ? ' — empty' : ` · ${player.hand.length}`}
      </div>
      {player.hand.length > 0 && (
        <div className="cards">
          {player.hand.map((c) => (
            <CardView key={c.uid} state={state} card={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function DevCostEditor({ state, send }: { state: GameState; send: (a: Action) => void }) {
  return (
    <details>
      <summary>Developer · card costs</summary>
      <p className="tiny light">
        Face costs for market cards. Overrides persist across New Game and apply to cards already in
        play. Masteries uses the Masteries row.
      </p>
      {CARD_CATALOG.map((c) => (
        <label key={c.name} className="dev-row">
          <span>
            {c.name}{' '}
            <span className="tiny light">
              printed {c.name === 'Extra Ingredient Slot' ? '$5/$10/$15M' : money(c.cost)}
            </span>
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={catalogCost(state, c.name, c.cost)}
            onChange={(e) =>
              send({
                type: 'SET_CARD_COST',
                cardName: c.name,
                cost: Math.max(0, Math.floor(Number(e.target.value) || 0)),
              })
            }
          />
        </label>
      ))}
    </details>
  )
}

function DevIncomeEditor({ state, send }: { state: GameState; send: (a: Action) => void }) {
  return (
    <details>
      <summary>Developer · recipe income</summary>
      <p className="tiny light">Overrides persist across New Game. Blank/default values come from the pay table.</p>
      {RECIPES.map((r) => (
        <label key={r.id} className="dev-row">
          <span>{r.name}</span>
          <input
            type="number"
            min={0}
            step={1}
            value={recipePay(state, r)}
            onChange={(e) =>
              send({
                type: 'SET_RECIPE_INCOME',
                recipeId: r.id,
                income: Math.max(0, Math.floor(Number(e.target.value) || 0)),
              })
            }
          />
        </label>
      ))}
    </details>
  )
}

function shortSeat(name: string) {
  return name.length <= 8 ? name : `${name.slice(0, 7)}…`
}

function RecipeProgress({
  state,
  viewerId,
}: {
  state: GameState
  viewerId?: string | null
}) {
  const players = state.players
  return (
    <details className="recipe-board-wrap" open={players.length > 0} data-testid="recipe-board">
      <summary>Recipe board</summary>
      <p className="tiny light">
        A check means that player has developed the recipe (Reputation granted on Done assigning). The
        gold name is who received the global +1 for introducing it first. Hover a recipe name for
        ingredient icons (glow = you have it) and the Research level needed.
      </p>
      <div className="recipe-board-scroll">
        <table className="ref-table recipe-board">
          <thead>
            <tr>
              <th>Recipe</th>
              {players.map((p) => (
                <th key={p.id} className={p.id === viewerId ? 'you-col' : undefined}>
                  {p.id === viewerId ? 'You' : shortSeat(p.name)}
                </th>
              ))}
              <th>First +1</th>
            </tr>
          </thead>
          <tbody>
            {([1, 2, 3] as const).flatMap((stage) => [
              <tr key={`stage-${stage}`} className="stage-head">
                <td colSpan={Math.max(2, players.length + 2)}>Stage {stage}</td>
              </tr>,
              ...RECIPES.filter((r) => r.likelyStage === stage).map((r) => {
                const firstId = state.firstIntroducedBy?.[r.id]
                const first = firstId ? state.players.find((p) => p.id === firstId) : undefined
                const viewer = viewerId ? players.find((p) => p.id === viewerId) : undefined
                const youMade = Boolean(viewer?.completedRecipes.includes(r.id))
                return (
                  <tr key={r.id} className={youMade ? 'you-made' : undefined} data-recipe={r.id}>
                    <td>
                      <HoverTip text={<RecipeNeeds recipe={r} player={viewer} state={state} />}>
                        <span className="recipe-board-name">{r.name}</span>
                      </HoverTip>
                    </td>
                    {players.map((p) => {
                      const made = p.completedRecipes.includes(r.id)
                      const intro = firstId === p.id
                      return (
                        <td
                          key={p.id}
                          className={[intro ? 'first-plus' : '', p.id === viewerId ? 'you-col' : '']
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {made ? (intro ? '✓+1' : '✓') : '·'}
                        </td>
                      )
                    })}
                    <td className={first ? 'first-plus' : undefined}>{first ? first.name : '—'}</td>
                  </tr>
                )
              }),
            ])}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function RecipeReference({ state }: { state: GameState }) {
  return (
    <details>
      <summary>Recipes by assembly stage</summary>
      {([1, 2, 3] as const).map((stage) => (
        <div key={stage} style={{ marginBottom: '0.55rem' }}>
          <div className="tiny light">
            <b>Stage {stage}</b>
          </div>
          {RECIPES.filter((r) => r.likelyStage === stage).map((r) => (
            <div key={r.id} className="tiny light">
              <b>{r.name}</b> (Res L{r.requiredRes}) {money(recipePay(state, r))}
              {state.incomeOverrides?.[r.id] !== undefined && state.incomeOverrides[r.id] !== r.income
                ? ` (printed ${money(r.income)})`
                : ''}{' '}
              · {r.ingredients.map((fam) => INGREDIENT_LABEL[fam]).join(', ')}
            </div>
          ))}
        </div>
      ))}
    </details>
  )
}

function CardCatalog({ state }: { state: GameState }) {
  return (
    <details>
      <summary>Card distribution</summary>
      <p className="tiny light">{STAGE_INGREDIENTS.join(' · ')}</p>
      <table className="ref-table">
        <thead>
          <tr>
            <th>Card</th>
            <th>Kind</th>
            <th>$</th>
            <th>S1</th>
            <th>S2</th>
            <th>S3</th>
          </tr>
        </thead>
        <tbody>
          {CARD_CATALOG.map((c) => (
            <tr key={c.name}>
              <td>
                {c.name}
                {c.notes ? <div className="tiny light">{c.notes}</div> : null}
              </td>
              <td>{c.kind}</td>
              <td>
                {c.name === 'Extra Ingredient Slot' && state.costOverrides?.['Extra Ingredient Slot'] === undefined
                  ? Object.values(SLOT_FACE_BY_STAGE).join('/')
                  : catalogCost(state, c.name, c.cost)}
              </td>
              {c.stages.map((s, i) => (
                <td key={`${c.name}-${i}`}>{s}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function TrackReference() {
  return (
    <details>
      <summary>Research & Reputation tracks</summary>
      <div className="tiny light" style={{ marginBottom: '0.55rem' }}>
        <b>Shared income</b> — both tracks pay $1M / $3M / $6M per turn at L1 / L2 / L3. These stack; they do not replace each other.
      </div>
      <div className="tiny light" style={{ marginBottom: '0.55rem' }}>
        <b>Research</b> — assign Junior / Senior / Master Researchers for +1 / +2 / +3 ResP. Levels: 3 → L1, 7 → L2, 11 → L3.
        Recipes list a Research requirement. Sea Salt is buyable with no gate; recipes that use it still need Research L2 to assign.
        Masteries need Research L3 only. Research also grants 25% off Coffee/Almond at L1, Wild Berries/Caramel at L2, and Royal Honey at L3.
      </div>
      <div className="tiny light" style={{ marginBottom: '0.55rem' }}>
        <b>Reputation</b> — assign Junior / Senior / Master Journalists for +2 / +3 / +4 Rep.         Completing a recipe on <b>Done assigning</b> (after the whole table finishes) awards 1 / 2 /
        3 / 6 Rep for 3 / 4 / 5 / 6 ingredients, plus +1 only if you are first in the game to make it
        (not Basic Chocolate). Same-turn first-intro ties go to the earlier turn-order token.
        Playing Schemes spends Rep. Levels: 4 → L1, 12 → L2, 20 → L3.
        No free Research from Reputation. Shop unlocks stay after you drop below the level; income and discounts do not.
        L1: ${REP_SLOT_L1_COST}M extra slot and a ${REP_JUNIOR_COST}M Junior Researcher. L2: ${REP_SLOT_L2_COST}M slot, ${REP_FACTORY_COST}M factory, and a ${REP_SENIOR_COST}M Senior Researcher. L3: another ${REP_SENIOR_COST}M Senior Researcher.
        Reputation also grants the same 25% family discounts as Research, and they add together.
      </div>
      <div className="tiny light">
        <b>Most Reputable</b> — first awarded to a unique lead with at least 4 Rep. Ties do not vacate it;
        the holder keeps the title until another player has strictly more Reputation (and still at least 4),
        or the holder drops below 4. Hostile Takeover overrides the title for this turn and the next 2.
        Discount applies only to pool purchases: $2M / $2M / $3M in Stages 1 / 2 / 3, then the track percents of the original face cost, floor $0.
        Example: Royal Honey $60 − $3 MR − $15 Research − $15 Reputation = $27M.
      </div>
    </details>
  )
}

function LogRail({
  state,
  onReset,
  send,
  viewerId,
}: {
  state: GameState
  onReset: () => void
  send: (a: Action) => void
  viewerId?: string | null
}) {
  return (
    <aside className="log-rail">
      <div className="row">
        <h3>Ledger</h3>
        <button type="button" className="secondary" onClick={onReset}>
          New game
        </button>
      </div>
      {state.effects.length > 0 && (
        <div className="tiny light" style={{ marginBottom: '0.6rem' }}>
          Effects:{' '}
          {state.effects
            .map((e) => {
              if (e.kind === 'price_gouging') return `Gouging ${e.family} (${e.remaining})`
              if (e.kind === 'embargo') return `Embargo ${e.family} (${e.remaining})`
              if (e.kind === 'labour') return `Labour Exploitation (${e.remaining})`
              return e.kind
            })
            .join(' · ')}
        </div>
      )}
      <div className="log">
        {[...state.log].reverse().map((e) => (
          <div key={e.id}>{e.text}</div>
        ))}
      </div>
          <div className="ref">
        <DevIncomeEditor state={state} send={send} />
        <DevCostEditor state={state} send={send} />
        <RecipeProgress state={state} viewerId={viewerId} />
        <IngredientsGuide state={state} />
        <TrackReference />
        <RecipeReference state={state} />
        <CardCatalog state={state} />
        <details>
          <summary>Schemes</summary>
          {Object.entries(SCHEME_INFO)
            .sort(([, a], [, b]) => a.name.localeCompare(b.name))
            .map(([id, info]) => (
            <div key={id} className="tiny light">
              <b>{info.name}</b> ({info.playCost}) — {info.text}
            </div>
          ))}
        </details>
        <details>
          <summary>Masteries</summary>
          {Object.values(MASTERY_INFO).map((m) => (
            <div key={m.name} className="tiny light">
              <b>{m.name}</b> — {m.text}
            </div>
          ))}
        </details>
      </div>
    </aside>
  )
}

function SchemeTargeter({
  state,
  player,
  schemeId,
  onPlay,
  onCancel,
  onSkip,
}: {
  state: GameState
  player: Player
  schemeId: keyof typeof SCHEME_INFO
  onPlay: (targets: SchemeTargets) => void
  onCancel?: () => void
  onSkip?: () => void
}) {
  const [targets, setTargets] = useState<SchemeTargets>({})
  const syntheticOpp = targets.opponentId ? state.players.find((p) => p.id === targets.opponentId) : undefined
  const syntheticFamilies = syntheticOpp ? ownedFamilies(syntheticOpp) : []
  const canConfirm =
    schemeId === 'synthetic_ingredient'
      ? Boolean(syntheticOpp && targets.family && ownsFamily(syntheticOpp, targets.family))
      : schemeId === 'forced_swap'
        ? Boolean(targets.opponentId && targets.ownCardUid && targets.theirCardUid)
        : schemeId === 'black_market'
          ? Boolean(targets.discardUid)
          : schemeId === 'unlicensed_chef'
            ? Boolean(targets.recipeId)
            : schemeId === 'artificial_shortage' || schemeId === 'price_gouging' || schemeId === 'embargo'
              ? Boolean(targets.family)
              : schemeId === 'double_agent'
                ? Boolean(
                    targets.opponentId &&
                      targets.opponentId2 &&
                      targets.ownCardUid &&
                      targets.ownCardUid2 &&
                      targets.theirCardUid &&
                      targets.theirCardUid2,
                  )
                : schemeId === 'press_leak'
                  ? Boolean(targets.opponentId && targets.opponentId2 && targets.opponentId !== targets.opponentId2)
                  : true
  return (
    <div className="modal-back">
      <div className="modal panel">
        <h3>{SCHEME_INFO[schemeId].name}</h3>
        <p className="tiny">{SCHEME_INFO[schemeId].text}</p>
        {schemeId === 'forced_swap' && (
          <>
            <select onChange={(e) => setTargets((t) => ({ ...t, opponentId: e.target.value }))}>
              <option value="">Opponent</option>
              {state.players
                .filter((p) => p.id !== player.id && p.supply.length > 0)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <select onChange={(e) => setTargets((t) => ({ ...t, ownCardUid: e.target.value }))}>
              <option value="">Your supply</option>
              {player.supply.map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.name}
                </option>
              ))}
            </select>
            {targets.opponentId && (
              <select onChange={(e) => setTargets((t) => ({ ...t, theirCardUid: e.target.value }))}>
                <option value="">Their supply</option>
                {playerById(state, targets.opponentId).supply.map((c) => (
                  <option key={c.uid} value={c.uid}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {schemeId === 'synthetic_ingredient' && (
          <>
            <select
              value={targets.opponentId ?? ''}
              onChange={(e) => setTargets({ opponentId: e.target.value || undefined, family: undefined })}
            >
              <option value="">Opponent</option>
              {state.players
                .filter((p) => p.id !== player.id && ownedFamilies(p).length > 0)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <select
              value={targets.family ?? ''}
              disabled={!syntheticOpp}
              onChange={(e) =>
                setTargets((t) => ({
                  ...t,
                  family: (e.target.value || undefined) as IngredientFamily | undefined,
                }))
              }
            >
              <option value="">{syntheticOpp ? 'Their ingredient' : 'Pick an opponent first'}</option>
              {syntheticFamilies.map((f) => (
                <option key={f} value={f}>
                  {INGREDIENT_LABEL[f]}
                  {syntheticOpp?.supply.some((c) => c.family === f)
                    ? ' (Supply)'
                    : ' (factory)'}
                </option>
              ))}
            </select>
            {syntheticOpp && syntheticFamilies.length === 0 && (
              <div className="hint">They have nothing in Supply or a factory to copy.</div>
            )}
          </>
        )}
        {schemeId === 'black_market' && (
          <select onChange={(e) => setTargets({ discardUid: e.target.value })}>
            <option value="">Discard card</option>
            {state.publicDiscard.map((c) => (
              <option key={c.uid} value={c.uid}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {schemeId === 'unlicensed_chef' && (
          <select onChange={(e) => setTargets({ recipeId: e.target.value })}>
            <option value="">Recipe</option>
            {RECIPES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} (Res L{r.requiredRes})
              </option>
            ))}
          </select>
        )}
        {schemeId === 'artificial_shortage' && (
          <select onChange={(e) => setTargets({ family: e.target.value as IngredientFamily })}>
            <option value="">Any ingredient</option>
            {(Object.keys(INGREDIENT_LABEL) as IngredientFamily[]).map((f) => (
              <option key={f} value={f}>
                {INGREDIENT_LABEL[f]}
              </option>
            ))}
          </select>
        )}
        {(schemeId === 'price_gouging' || schemeId === 'embargo') && (
          <select onChange={(e) => setTargets({ family: e.target.value as IngredientFamily })}>
            <option value="">Ingredient</option>
            {(Object.keys(INGREDIENT_LABEL) as IngredientFamily[])
              .filter((f) => f !== 'cocoa' && f !== 'sugar')
              .map((f) => (
                <option key={f} value={f}>
                  {INGREDIENT_LABEL[f]}
                </option>
              ))}
          </select>
        )}
        {schemeId === 'double_agent' && (
          <>
            <select
              onChange={(e) => setTargets((t) => ({ ...t, opponentId: e.target.value, theirCardUid: undefined }))}
            >
              <option value="">First opponent</option>
              {state.players
                .filter((p) => p.id !== player.id && p.id !== targets.opponentId2 && p.hand.length > 0)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <select
              onChange={(e) => setTargets((t) => ({ ...t, opponentId2: e.target.value, theirCardUid2: undefined }))}
            >
              <option value="">Second opponent</option>
              {state.players
                .filter((p) => p.id !== player.id && p.id !== targets.opponentId && p.hand.length > 0)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <select onChange={(e) => setTargets((t) => ({ ...t, ownCardUid: e.target.value }))}>
              <option value="">Your card for the first swap</option>
              {player.hand
                .filter((c) => c.uid !== targets.ownCardUid2)
                .map((c) => (
                  <option key={c.uid} value={c.uid}>
                    {c.name}
                  </option>
                ))}
            </select>
            <select onChange={(e) => setTargets((t) => ({ ...t, ownCardUid2: e.target.value }))}>
              <option value="">Your card for the second swap</option>
              {player.hand
                .filter((c) => c.uid !== targets.ownCardUid)
                .map((c) => (
                  <option key={c.uid} value={c.uid}>
                    {c.name}
                  </option>
                ))}
            </select>
            {targets.opponentId && (
              <select onChange={(e) => setTargets((t) => ({ ...t, theirCardUid: e.target.value }))}>
                <option value="">{playerById(state, targets.opponentId).name}'s card</option>
                {playerById(state, targets.opponentId).hand.map((c) => (
                  <option key={c.uid} value={c.uid}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {targets.opponentId2 && (
              <select onChange={(e) => setTargets((t) => ({ ...t, theirCardUid2: e.target.value }))}>
                <option value="">{playerById(state, targets.opponentId2).name}'s card</option>
                {playerById(state, targets.opponentId2).hand.map((c) => (
                  <option key={c.uid} value={c.uid}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {schemeId === 'press_leak' && (
          <>
            <select
              onChange={(e) => setTargets((t) => ({ ...t, opponentId: e.target.value, theirCardUid: undefined }))}
            >
              <option value="">First opponent</option>
              {state.players
                .filter((p) => p.id !== player.id && p.id !== targets.opponentId2)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <select
              onChange={(e) => setTargets((t) => ({ ...t, opponentId2: e.target.value, theirCardUid2: undefined }))}
            >
              <option value="">Second opponent</option>
              {state.players
                .filter((p) => p.id !== player.id && p.id !== targets.opponentId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            {targets.opponentId && (
              <select onChange={(e) => setTargets((t) => ({ ...t, theirCardUid: e.target.value || undefined }))}>
                <option value="">
                  {playerById(state, targets.opponentId).schemes.length >= 2
                    ? `Discard one of ${playerById(state, targets.opponentId).name}'s Schemes (optional)`
                    : `${playerById(state, targets.opponentId).name} has fewer than 2 Schemes`}
                </option>
                {playerById(state, targets.opponentId).schemes.length >= 2 &&
                  playerById(state, targets.opponentId).schemes.map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}
            {targets.opponentId2 && (
              <select onChange={(e) => setTargets((t) => ({ ...t, theirCardUid2: e.target.value || undefined }))}>
                <option value="">
                  {playerById(state, targets.opponentId2).schemes.length >= 2
                    ? `Discard one of ${playerById(state, targets.opponentId2).name}'s Schemes (optional)`
                    : `${playerById(state, targets.opponentId2).name} has fewer than 2 Schemes`}
                </option>
                {playerById(state, targets.opponentId2).schemes.length >= 2 &&
                  playerById(state, targets.opponentId2).schemes.map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}
          </>
        )}
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <button type="button" disabled={!canConfirm} onClick={() => onPlay(targets)}>
            {onCancel
              ? `Play (${schemePlayCost(schemeId, state.playerCount, state.stage)} Rep)`
              : 'Confirm targets'}
          </button>
          {onCancel && (
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          {onSkip && (
            <button type="button" className="secondary" onClick={onSkip}>
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function AssignmentView({
  state,
  player,
  send,
}: {
  state: GameState
  player: Player
  send: (a: Action) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const cards = player.supply.filter((c) => selected.includes(c.uid))
  const match = findMatchingRecipe(cards)
  const toggle = (uid: string) => {
    setSelected((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]))
  }
  const emptyFactory = player.factories.find((f) => !f.recipeId && f.ingredients.length === 0)
  const ready = emptyFactory ? buildableOnFactory(state, player, emptyFactory) : []
  return (
    <div className="grid">
      <h2>Assignment — {player.name}</h2>
      <p className="tiny">
        Research L{resLevel(player)} ({resP(player)} pts) · Reputation L{repLevel(player)} (
        {repP(player)} pts) · Unassigned slots {player.extraSlotPool}
      </p>
      {ready.length > 0 && (
        <div>
          <h3>Ready to produce</h3>
          <p className="tiny">Click a recipe to put it in an empty factory using cards from Supply.</p>
          <div className="row">
            {ready.map(({ recipe, cards: used }) => (
              <HoverTip key={recipe.id} text={<RecipeNeeds recipe={recipe} player={player} state={state} />}>
                <button
                  type="button"
                  data-testid={`ready-recipe-${recipe.id}`}
                  onClick={() => {
                    if (!emptyFactory) return
                    send({
                      type: 'ASSIGN_RECIPE',
                      factoryId: emptyFactory.id,
                      cardUids: used.map((c) => c.uid),
                    })
                    setSelected([])
                  }}
                >
                  {recipe.name} ({money(recipePay(state, recipe))}/turn)
                </button>
              </HoverTip>
            ))}
          </div>
        </div>
      )}
      <div className="row">
        <button
          type="button"
          disabled={player.boughtRepSlot || repLevel(player) < 1 || player.cash < REP_SLOT_L1_COST}
          onClick={() => send({ type: 'BUY_EXTRA_SLOT', track: 1 })}
        >
          Buy extra slot ${REP_SLOT_L1_COST}M (Rep L1)
        </button>
        <button
          type="button"
          disabled={player.boughtRepSlotL2 || repLevel(player) < 2 || player.cash < REP_SLOT_L2_COST}
          onClick={() => send({ type: 'BUY_EXTRA_SLOT', track: 2 })}
        >
          Buy extra slot ${REP_SLOT_L2_COST}M (Rep L2)
        </button>
        <button
          type="button"
          disabled={player.boughtExtraFactory || repLevel(player) < 2 || player.cash < REP_FACTORY_COST}
          onClick={() => send({ type: 'BUY_EXTRA_FACTORY' })}
        >
          Buy extra factory ${REP_FACTORY_COST}M
        </button>
        <button
          type="button"
          disabled={player.boughtJuniorResearcher || repLevel(player) < 1 || player.cash < REP_JUNIOR_COST}
          onClick={() => send({ type: 'BUY_TRACK_RESEARCHER', kind: 'junior' })}
        >
          Buy Junior Researcher ${REP_JUNIOR_COST}M
        </button>
        <button
          type="button"
          disabled={player.boughtSeniorResearcherL2 || repLevel(player) < 2 || player.cash < REP_SENIOR_COST}
          onClick={() => send({ type: 'BUY_TRACK_RESEARCHER', kind: 'senior_l2' })}
        >
          Buy Senior Researcher ${REP_SENIOR_COST}M (Rep L2)
        </button>
        <button
          type="button"
          disabled={player.boughtSeniorResearcherL3 || repLevel(player) < 3 || player.cash < REP_SENIOR_COST}
          onClick={() => send({ type: 'BUY_TRACK_RESEARCHER', kind: 'senior_l3' })}
        >
          Buy Senior Researcher ${REP_SENIOR_COST}M (Rep L3)
        </button>
        <button type="button" className="secondary" onClick={() => send({ type: 'FINISH_ASSIGNMENT' })}>
          Done assigning
        </button>
      </div>
      <h3>Supply</h3>
      <p className="tiny">Ingredient cards: click to select, then Assign on a factory. Specialists assign immediately.</p>
      <div className="cards">
        {player.supply.map((c) => (
          <CardView
            key={c.uid}
            state={state}
            card={c}
            selected={selected.includes(c.uid)}
            onClick={() => {
              if (c.kind === 'ingredient') toggle(c.uid)
              else send({ type: 'ASSIGN_SPECIALIST', cardUid: c.uid })
            }}
          />
        ))}
        {player.supply.length === 0 && <span className="tiny">Empty supply.</span>}
      </div>
      {match && <div className="tiny">Selected recipe: {match.name} ({money(recipePay(state, match))}/turn)</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {player.factories.map((f) => {
          const check = canAssignRecipe(state, player, f, cards)
          const auto = buildableOnFactory(state, player, f)
          const fallback = auto[0]
          return (
            <div key={f.id} className={`factory ${f.recipeId ? '' : 'empty'}`}>
              <h4>{f.recipeId ? recipeById(f.recipeId).name : 'Empty factory'}</h4>
              <div className="hint">
                Slots {factoryCapacity(f)} · extras {f.extraSlots}
                {f.hazardousSlots > 0 ? ` · hazardous ${f.hazardousSlots}` : ''}
              </div>
              {f.ingredients.map((c) => (
                <div key={c.uid} className="hint">
                  {c.name}
                </div>
              ))}
              <div className="row" style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  data-testid={`assign-factory-${f.id}`}
                  disabled={Boolean(f.recipeId)}
                  onClick={() => {
                    send({
                      type: 'ASSIGN_RECIPE',
                      factoryId: f.id,
                      cardUids: check.ok ? selected : fallback?.cards.map((c) => c.uid) ?? [],
                    })
                    setSelected([])
                  }}
                >
                  {check.ok ? `Assign ${match?.name ?? 'recipe'}` : fallback ? `Assign ${fallback.recipe.name}` : 'Assign'}
                </button>
                <button type="button" className="secondary" onClick={() => send({ type: 'MOVE_SLOTS', factoryId: f.id, delta: 1 })}>
                  + slot
                </button>
                <button type="button" className="secondary" onClick={() => send({ type: 'MOVE_SLOTS', factoryId: f.id, delta: -1 })}>
                  − slot
                </button>
                {f.recipeId && (
                  <button type="button" className="danger" onClick={() => send({ type: 'TEAR_DOWN', factoryId: f.id })}>
                    Tear down
                  </button>
                )}
              </div>
              {!f.recipeId && auto.length === 0 && (
                <div className="hint">No valid recipe from current Supply fits this factory.</div>
              )}
              {!check.ok && selected.length > 0 && <div className="hint">{check.reason}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PhaseView({
  state,
  send,
  selfId,
  online,
}: {
  state: GameState
  send: (a: Action) => void
  selfId?: string | null
  online?: boolean
}) {
  const viewerId = online && selfId ? selfId : viewingPlayerId(state)
  const player = viewerId ? playerById(state, viewerId) : state.players[0]
  const bidSession = `${viewerId ?? ''}:${state.phase}:${state.bidRound}`
  const [bidState, setBidState] = useState({ session: bidSession, amount: 0 })
  const bid = bidState.session === bidSession ? bidState.amount : 0
  if (bidState.session !== bidSession) {
    setBidState({ session: bidSession, amount: 0 })
  }

  if (online && selfId && state.players.length > 0) {
    const vetoId = state.pendingScheme ? currentVetoId(state) : null
    const required = vetoId ?? requiredActorId(state)
    const waitingOnSelf = canPlayerAct(state, selfId)
    if ((required && required !== selfId) || (!required && !waitingOnSelf && !['bid_reveal', 'dice_tie', 'relief_dice', 'income', 'game_over'].includes(state.phase))) {
      const who = required ? playerById(state, required).name : 'the other chocolatiers'
      return (
        <div className="panel">
          <h2>Waiting for {who}</h2>
          <p className="tiny">
            {state.pendingScheme
              ? `Veto window for ${state.pendingScheme.name}.`
              : `Their move: ${state.phase.replace('_', ' ')}.`}
          </p>
        </div>
      )
    }
  }

  if (state.phase === 'curtain' && state.curtainPlayerId) {
    const next = playerById(state, state.curtainPlayerId)
    return (
      <div className="curtain">
        <div>
          <div className="brand">Pass the device</div>
          <h2>{next.name}</h2>
          <p>Hide the screen until they are ready.</p>
          <button type="button" data-testid="ack-curtain" onClick={() => send({ type: 'ACK_CURTAIN' })}>
            I am {next.name}
          </button>
        </div>
      </div>
    )
  }

  if (state.pendingScheme && currentVetoId(state)) {
    const vetoer = playerById(state, currentVetoId(state)!)
    const veto = vetoer.schemes.find((c) => c.schemeId === 'veto_power')
    return (
      <div className="panel">
        <h2>Veto window — {vetoer.name}</h2>
        <p>
          {playerById(state, state.pendingScheme.playerId).name} is playing{' '}
          <b>{state.pendingScheme.name}</b> (play cost {state.pendingScheme.playCost} Rep).
        </p>
        <div className="row">
          <button
            type="button"
            disabled={!veto || repP(vetoer) < 1}
            onClick={() => veto && send({ type: 'VETO', cardUid: veto.uid })}
          >
            Play Veto Power
          </button>
          <button type="button" className="secondary" data-testid="decline-veto" onClick={() => send({ type: 'DECLINE_VETO' })}>
            Decline
          </button>
        </div>
      </div>
    )
  }

  if (state.phase === 'bid' || state.phase === 'bid_tie') {
    return (
      <div className="panel">
        <h2>{state.phase === 'bid_tie' ? 'Tie bid' : 'Closed bid'} — {player.name}</h2>
        <p className="tiny">Bids are paid to the Bank. $0 is allowed. Increments of $1M.</p>
        <p>Cash on hand: {money(player.cash)}</p>
        <div className="row">
          <input
            key={bidSession}
            type="number"
            data-testid="bid-amount"
            min={0}
            max={player.cash}
            step={1}
            value={bid}
            onChange={(e) =>
              setBidState({
                session: bidSession,
                amount: Math.max(0, Math.floor(Number(e.target.value) || 0)),
              })
            }
          />
          <button type="button" data-testid="submit-bid" onClick={() => send({ type: 'BID', amount: Math.min(bid, player.cash) })}>
            Bid {money(Math.min(bid, player.cash))}
          </button>
        </div>
      </div>
    )
  }

  if (state.phase === 'bid_reveal') {
    return (
      <div className="panel">
        <h2>Bids revealed</h2>
        {state.players.map((p) => (
          <div key={p.id}>
            {p.name}: {state.bids[p.id] !== undefined ? money(state.bids[p.id]) : '—'}
          </div>
        ))}
        <button type="button" data-testid="ack-bids" onClick={() => send({ type: 'ACK_BIDS' })}>
          Set turn order
        </button>
      </div>
    )
  }

  if (state.phase === 'dice_tie' || state.phase === 'relief_dice') {
    return (
      <div className="panel">
        <h2>{state.phase === 'relief_dice' ? 'Relief order dice' : 'Dice break'}</h2>
        {state.dicePrefix.length > 0 && (
          <p className="tiny">Already ahead: {state.dicePrefix.map((id) => playerById(state, id).name).join(', ')}</p>
        )}
        <p>{state.tieIds.map((id) => playerById(state, id).name).join(', ')} remain tied and will reroll.</p>
        {state.diceSuffix.length > 0 && (
          <p className="tiny">Already behind: {state.diceSuffix.map((id) => playerById(state, id).name).join(', ')}</p>
        )}
        <button type="button" data-testid="roll-dice" onClick={() => send({ type: 'ROLL_DICE' })}>
          Roll 2d6
        </button>
      </div>
    )
  }

  if (state.phase === 'contribute') {
    return (
      <div className="panel">
        <h2>Market composition — {player.name}</h2>
        <p className="tiny">Choose one card from your hand for the shared pool.</p>
        <div className="cards">
          {player.hand.map((c) => (
            <CardView key={c.uid} state={state} card={c} testId="contribute-card" onClick={() => send({ type: 'CONTRIBUTE', cardUid: c.uid })} />
          ))}
        </div>
      </div>
    )
  }

  if (state.phase === 'private_viewing') {
    const pv = player.schemes.find((c) => c.schemeId === 'private_viewing')
    return (
      <div className="panel">
        <h2>Private Viewing window — {player.name}</h2>
        <p>Pool: {state.pool.map((c) => c.name).join(', ')}</p>
        <div className="row">
          <button
            type="button"
            disabled={!pv || player.schemePlayedThisRound || repP(player) < 2}
            onClick={() => pv && send({ type: 'PLAY_PRIVATE_VIEWING', cardUid: pv.uid })}
          >
            Play Private Viewing (2 Rep)
          </button>
          <button type="button" className="secondary" data-testid="pass-pv" onClick={() => send({ type: 'PASS_PRIVATE_VIEWING' })}>
            Pass
          </button>
        </div>
      </div>
    )
  }

  if (state.phase === 'purchase') {
    return (
      <div className="panel">
        <h2>Purchasing — {player.name}</h2>
        <p>
          Cash {money(player.cash)}
          {mostReputableId(state) === player.id ? ' · Most Reputable discount applies' : ''}
        </p>
        <div className="cards">
          {state.pool.map((c) => {
            const obtain = canObtain(player, c)
            const price = poolPrice(state, player, c)
            return (
              <div key={c.uid}>
                <CardView state={state} card={c} locked={!obtain} price={obtain ? price : undefined} />
                <div className="row" style={{ marginTop: '0.35rem' }}>
                  <button
                    type="button"
                    disabled={!obtain || player.cash < price}
                    onClick={() => send({ type: 'BUY_POOL', cardUid: c.uid })}
                  >
                    Buy
                  </button>
                  <button type="button" className="secondary" data-testid="discard-pool" onClick={() => send({ type: 'DISCARD_POOL', cardUid: c.uid })}>
                    Discard +${discardPay(state.stage)}M
                  </button>
                </div>
                {!obtain && <div className="tiny warn">Need the required track level to buy.</div>}
              </div>
            )
          })}
        </div>
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <button
            type="button"
            disabled={state.openCocoa <= 0 || player.cash < openMarketPay(state.stage)}
            onClick={() => send({ type: 'BUY_OPEN', item: 'cocoa' })}
          >
            Open Cocoa ${openMarketPay(state.stage)}M ({state.openCocoa})
          </button>
          <button
            type="button"
            disabled={state.openSugar <= 0 || player.cash < openMarketPay(state.stage)}
            onClick={() => send({ type: 'BUY_OPEN', item: 'sugar' })}
          >
            Open Sugar ${openMarketPay(state.stage)}M ({state.openSugar})
          </button>
        </div>
        {state.masteryMarket.length > 0 && (
          <div style={{ marginTop: '0.8rem' }}>
            <h3>Masteries</h3>
            <p className="tiny">Research L3, ${MASTERY_COST}M, one per player. Does not use your pool pick.</p>
            <div className="cards">
              {state.masteryMarket.map((c) => {
                const obtain = canObtain(player, c)
                const price = faceCost(state, c)
                return (
                  <div key={c.uid}>
                    <CardView state={state} card={c} locked={!obtain} price={obtain ? price : undefined} />
                    <button
                      type="button"
                      disabled={!obtain || player.cash < price}
                      onClick={() => send({ type: 'BUY_MASTERY', cardUid: c.uid })}
                    >
                      Buy Mastery
                    </button>
                    {!obtain && <div className="tiny warn">Need Research L3 and no Mastery yet.</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (state.phase === 'scheme') {
    const actor = currentActor(state)
    const draft = state.schemeDraft ?? []
    if (state.pendingScheme?.awaitingTargets) {
      const caster = playerById(state, state.pendingScheme.playerId)
      return (
        <div className="panel">
          <h2>Scheme — {caster.name}</h2>
          <p className="tiny">Veto cleared. Choose how this Scheme resolves.</p>
          <SchemeTargeter
            state={state}
            player={caster}
            schemeId={state.pendingScheme.schemeId}
            onPlay={(targets) => send({ type: 'CONFIRM_SCHEME_TARGETS', targets })}
            onSkip={() => send({ type: 'SKIP_SCHEME' })}
          />
        </div>
      )
    }
    if (draft.length > 0) {
      return (
        <div className="panel">
          <h2>Keep one Scheme — {actor.name}</h2>
          <p className="tiny">You drew 3. Keep 1; the other two return to the deck and it is reshuffled.</p>
          <div className="cards">
            {draft.map((c) => (
              <HoverTip key={c.uid} text={schemeTooltip(c.schemeId, state.playerCount, state.stage)}>
                <button
                  type="button"
                  className="card"
                  data-testid="keep-scheme"
                  onClick={() => send({ type: 'KEEP_SCHEME', cardUid: c.uid })}
                >
                  <div className="card-top">
                    <KindIcon kind="scheme" />
                    <div className="kind">scheme</div>
                  </div>
                  <b>{c.name}</b>
                </button>
              </HoverTip>
            ))}
          </div>
        </div>
      )
    }
    return (
      <div className="panel">
        <h2>Scheme — {actor.name}</h2>
        <p className="tiny">
          Hand limit 3 · Play 1 Scheme (Veto excluded) · Draw 3, keep 1, costs 1 Rep · Deck {state.schemeDeck.length}
        </p>
        <div className="cards">
          {actor.schemes.map((c) => (
            <HoverTip key={c.uid} text={schemeTooltip(c.schemeId, state.playerCount, state.stage)}>
              <button
                type="button"
                className="card"
                onClick={() => {
                  if (c.schemeId === 'veto_power' || c.schemeId === 'private_viewing') return
                  send({ type: 'PLAY_SCHEME', cardUid: c.uid })
                }}
                disabled={
                  c.schemeId === 'veto_power' ||
                  c.schemeId === 'private_viewing' ||
                  actor.schemePlayedThisRound ||
                  repP(actor) < schemePlayCost(c.schemeId, state.playerCount, state.stage) ||
                  (c.schemeId === 'defamation_ops' &&
                    (!mostReputableId(state) || mostReputableId(state) === actor.id)) ||
                  (c.schemeId === 'double_agent' &&
                    (actor.hand.length < 2 ||
                      state.players.filter((p) => p.id !== actor.id && p.hand.length > 0).length < 2))
                }
              >
                <div className="card-top">
                  <KindIcon kind="scheme" />
                  <div className="kind">scheme</div>
                </div>
                <b>{c.name}</b>
                <div className="cost">
                  {c.schemeId === 'private_viewing'
                    ? 'Play during the Private Viewing window'
                    : `Play ${schemePlayCost(c.schemeId, state.playerCount, state.stage)} Rep`}
                </div>
              </button>
            </HoverTip>
          ))}
        </div>
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <button type="button" disabled={!canDrawScheme(state, actor)} onClick={() => send({ type: 'DRAW_SCHEME' })}>
            Draw 3 schemes (−1 Rep)
          </button>
          <button type="button" className="secondary" data-testid="skip-scheme" onClick={() => send({ type: 'SKIP_SCHEME' })}>
            End scheme phase
          </button>
        </div>
      </div>
    )
  }

  if (state.phase === 'relief') {
    const picker = player
    const stage = reliefStage(state)
    const taken = state.reliefPicks[picker.id] ?? []
    const max = state.reliefMax[picker.id] ?? 0
    const discards = publicIngredients(state)
    const option = (kind: ReliefKind, label: string, hidden = false) =>
      hidden ? null : (
        <button
          type="button"
          data-testid={`choose-relief-${kind}`}
          disabled={taken.includes(kind) || taken.length >= max}
          onClick={() => send({ type: 'CHOOSE_RELIEF', kind })}
        >
          {label}
        </button>
      )
    return (
      <div className="panel">
        <h2>End of Stage {state.stage} relief — {picker.name}</h2>
        <p className="tiny">
          Frozen standings. Rank 3+ may take up to 1 package. Each package costs{' '}
          {RELIEF_PENALTY[stage]} final-score penalty. You may skip.
        </p>
        <div className="tiny" style={{ marginBottom: '0.6rem' }}>
          {state.players
            .slice()
            .sort((a, b) => (state.reliefRanks[a.id] ?? 99) - (state.reliefRanks[b.id] ?? 99))
            .map((p) => (
              <div key={p.id}>
                #{state.reliefRanks[p.id]} {p.name}
                {p.id === picker.id ? ' · choosing' : ''} — up to {state.reliefMax[p.id] ?? 0}
              </div>
            ))}
        </div>
        <p className="tiny">
          Taken {taken.length}/{max}
          {taken.length > 0 ? ` (${taken.join(', ')})` : ''}
        </p>
        <div className="row">
          {option('res', `+${RELIEF_RES[stage]} ResP`)}
          {option('rep', `+${RELIEF_REP[stage]} Rep`)}
          {option('cash', `+$${RELIEF_CASH[stage]}M`)}
        </div>
        {discards.length > 0 && !taken.includes('discard') && taken.length < max && (
          <div style={{ marginTop: '0.6rem' }}>
            <p className="tiny">Or take one public Discard ingredient:</p>
            <div className="row">
              {discards.map((c) => (
                <button
                  key={c.uid}
                  type="button"
                  onClick={() => send({ type: 'CHOOSE_RELIEF', kind: 'discard', discardUid: c.uid })}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          className="secondary"
          data-testid="skip-relief"
          style={{ marginTop: '0.8rem' }}
          onClick={() => send({ type: 'SKIP_RELIEF' })}
        >
          Skip remaining relief
        </button>
      </div>
    )
  }

  if (state.phase === 'assignment') {
    const assignPlayer =
      online && selfId ? playerById(state, selfId) : playerById(state, viewingPlayerId(state) ?? state.players[0].id)
    if (state.assignmentDone[assignPlayer.id]) {
      return (
        <div className="panel">
          <h2>Assignment done — {assignPlayer.name}</h2>
          <p className="tiny">Waiting for the other chocolatiers to finish assigning.</p>
        </div>
      )
    }
    return (
      <div className="panel">
        <AssignmentView state={state} player={assignPlayer} send={send} />
      </div>
    )
  }

  if (state.phase === 'income') {
    return (
      <div className="panel">
        <h2>Income</h2>
        {state.players.map((p) => {
          const b = p.lastBreakdown
          return (
            <div key={p.id}>
              <b>{p.name}</b> {money(b.total)} — factories {money(b.factories)}, research{' '}
              {money(b.research)}, reputation {money(b.reputation)}
            </div>
          )
        })}
        <button type="button" data-testid="ack-income" onClick={() => send({ type: 'ACK_INCOME' })}>
          Next round
        </button>
      </div>
    )
  }

  if (state.phase === 'game_over') {
    const scores = [...finalScores(state)].sort((a, b) => b.total - a.total)
    return (
      <div className="panel">
        <h2>Final tasting</h2>
        <table className="score-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Cash</th>
              <th>5×Res</th>
              <th>4×Rep</th>
              <th>3×Production</th>
              <th>Masteries</th>
              <th>+25 split</th>
              <th>Relief</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s, i) => (
              <tr key={s.id} className={i === 0 ? 'win' : ''}>
                <td>{s.name}</td>
                <td>{s.cash}</td>
                <td>{s.research}</td>
                <td>{s.reputation}</td>
                <td>{s.production}</td>
                <td>{s.masteries}</td>
                <td>{s.bonus}</td>
                <td>{s.relief ? `−${s.relief}` : '—'}</td>
                <td>
                  <b>{s.total}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={() => send({ type: 'NEW_GAME' })}>
          Another game
        </button>
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>Chocolatier</h2>
    </div>
  )
}

function readRoomQuery(): string {
  if (typeof location === 'undefined') return ''
  const raw = new URLSearchParams(location.search).get('room') ?? ''
  const code = normalizeRoomCode(raw)
  return isRoomCode(code) ? code : ''
}

export default function App() {
  const [state, setState] = useState<GameState>(loadState)
  const [joinCode, setJoinCode] = useState('')
  const [roomCode, setRoomCode] = useState(readRoomQuery)
  const [roomSnap, setRoomSnap] = useState<RoomSnapshot | null>(() => {
    const code = readRoomQuery()
    return code ? readCachedRoom(code)?.room ?? null : null
  })
  const [you, setYou] = useState(() => {
    const code = readRoomQuery()
    return code ? readCachedRoom(code)?.you ?? '' : ''
  })
  const [roomErr, setRoomErr] = useState('')
  const roomSend = useRef<((msg: ClientMessage) => void) | null>(null)

  useEffect(() => {
    if (!roomCode || !isRoomCode(roomCode)) return
    setRoomErr('')
    const session = connectRoom(
      roomCode,
      (snap, id) => {
        writeCachedRoom(roomCode, snap, id)
        setRoomSnap(snap)
        setYou(id)
      },
      setRoomErr,
    )
    roomSend.current = session.send
    const url = new URL(location.href)
    url.searchParams.set('room', roomCode)
    history.replaceState(null, '', url)
    return () => {
      session.dispose()
      roomSend.current = null
    }
  }, [roomCode])

  const online = Boolean(roomCode && roomSnap)
  const liveState = online && roomSnap?.game ? roomSnap.game : state
  const selfId = roomSnap?.seats.find((s) => s.claimedBy === you)?.id ?? null
  const rawViewerId =
    liveState.phase === 'curtain' ? null : online ? selfId : viewingPlayerId(liveState)
  const viewerId =
    rawViewerId && (online || !playerById(liveState, rawViewerId).isBot) ? rawViewerId : null
  const viewState = useMemo(() => filterStateForPlayer(liveState, viewerId), [liveState, viewerId])

  const send = (action: Action) => {
    if (online) {
      if (action.type === 'NEW_GAME') roomSend.current?.({ type: 'newGame' })
      else roomSend.current?.({ type: 'action', action })
      return
    }
    setState((s) => dispatch(s, action))
  }

  useEffect(() => {
    if (online) return
    localStorage.setItem(STORAGE, JSON.stringify(state))
    localStorage.setItem(INCOME_STORAGE, JSON.stringify(state.incomeOverrides ?? {}))
    localStorage.setItem(COST_STORAGE, JSON.stringify(state.costOverrides ?? {}))
  }, [state, online])

  const incomeHint = useMemo(() => {
    if (liveState.players.length === 0) return null
    return Object.fromEntries(liveState.players.map((p) => [p.id, playerIncome(liveState, p).total]))
  }, [liveState])

  const leaveRoom = () => {
    clearCachedRoom()
    setRoomCode('')
    setRoomSnap(null)
    setYou('')
    const url = new URL(location.href)
    url.searchParams.delete('room')
    history.replaceState(null, '', url)
  }

  if (roomCode && roomSnap && !roomSnap.game) {
    return (
      <div data-testid="game-root" data-phase="lobby">
        <RoomLobby
          code={roomCode}
          room={roomSnap}
          you={you}
          send={(msg) => roomSend.current?.(msg)}
          error={roomErr}
          onLeave={leaveRoom}
        />
        <HowToPlay />
        <div className="setup panel" style={{ marginTop: '1rem' }}>
          <DevIncomeEditor state={liveState} send={send} />
          <DevCostEditor state={liveState} send={send} />
          <div className="ref" style={{ marginTop: '0.6rem' }}>
            <RecipeProgress state={liveState} viewerId={selfId} />
            <IngredientsGuide state={liveState} />
            <TrackReference />
            <RecipeReference state={liveState} />
            <CardCatalog state={liveState} />
          </div>
        </div>
      </div>
    )
  }

  if (roomCode && !roomSnap) {
    return (
      <div data-testid="game-root" data-phase="lobby" className="setup panel">
        <h2>Joining {roomCode}…</h2>
        {roomErr && <p className="tiny warn">{roomErr}</p>}
        <button type="button" className="secondary" onClick={leaveRoom}>
          Cancel
        </button>
      </div>
    )
  }

  if (liveState.phase === 'setup') {
    return (
      <div data-testid="game-root" data-phase="setup">
        <Setup
          onStart={(seats) => send({ type: 'START', config: { seats } })}
        />
        <OnlineEntry
          onCreate={() => setRoomCode(createRoomCode())}
          onJoin={() => {
            const code = normalizeRoomCode(joinCode)
            if (isRoomCode(code)) setRoomCode(code)
          }}
          joinCode={joinCode}
          onJoinCode={setJoinCode}
        />
        <HowToPlay />
        <div className="setup panel" style={{ marginTop: '1rem' }}>
          <DevIncomeEditor state={liveState} send={send} />
          <DevCostEditor state={liveState} send={send} />
          <div className="ref" style={{ marginTop: '0.6rem' }}>
            <RecipeProgress state={liveState} />
            <IngredientsGuide state={liveState} />
            <TrackReference />
            <RecipeReference state={liveState} />
            <CardCatalog state={liveState} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app" data-testid="game-root" data-phase={liveState.phase}>
      <PlayerRail state={viewState} selfId={viewerId} />
      <main className="main">
        {online && roomCode && (
          <p className="tiny light">
            Room {roomCode}
            {selfId ? ` · you are ${playerById(liveState, selfId).name}` : ''}
          </p>
        )}
        <PhaseView
          key={`${online ? selfId ?? 'online' : viewingPlayerId(liveState) ?? 'hotseat'}:${liveState.phase}:${liveState.bidRound}`}
          state={viewState}
          send={send}
          selfId={selfId}
          online={online}
        />
        <OwnHandDock state={viewState} viewerId={viewerId} />
        {incomeHint && liveState.phase !== 'game_over' && (
          <p className="tiny light" style={{ marginTop: '0.8rem' }}>
            Current production if paid now:{' '}
            {liveState.players.map((p) => `${p.name} ${money(incomeHint[p.id] ?? 0)}`).join(' · ')}
          </p>
        )}
      </main>
      <LogRail
        state={viewState}
        onReset={() => send({ type: 'NEW_GAME' })}
        send={send}
        viewerId={viewerId}
      />
    </div>
  )
}
