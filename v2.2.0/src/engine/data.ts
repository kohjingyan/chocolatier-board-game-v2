import type {
  GameCard,
  IngredientFamily,
  MasteryId,
  Recipe,
  SchemeCard,
  SchemeId,
} from './types'

let uidSeq = 0
export function resetUid(n = 0) {
  uidSeq = n
}

export function ensureUidAtLeast(n: number) {
  if (n > uidSeq) uidSeq = n
}
export function uid(prefix: string) {
  uidSeq += 1
  return `${prefix}-${uidSeq}`
}

export const INGREDIENT_LABEL: Record<IngredientFamily, string> = {
  cocoa: 'Cocoa',
  sugar: 'Sugar',
  milk: 'Milk',
  matcha: 'Matcha',
  coffee: 'Coffee',
  almond: 'Almond',
  wild_berries: 'Wild Berries',
  caramel: 'Caramel',
  sea_salt: 'Sea Salt',
  royal_honey: 'Royal Honey',
}

export function familyOf(card: GameCard): IngredientFamily | undefined {
  return card.family
}

export const RECIPES: Recipe[] = [
  { id: 'basic', name: 'Basic Chocolate', ingredients: ['cocoa', 'sugar'], income: 1, requiredRes: 0, limit: 'unlimited', likelyStage: 1 },
  { id: 'dark', name: 'Dark Chocolate', ingredients: ['cocoa', 'cocoa', 'sugar'], income: 2, requiredRes: 0, limit: 'unlimited', likelyStage: 1 },
  { id: 'milk', name: 'Milk Chocolate', ingredients: ['cocoa', 'milk', 'sugar'], income: 2, requiredRes: 0, limit: 'unlimited', likelyStage: 1 },
  { id: 'matcha', name: 'Matcha Chocolate', ingredients: ['cocoa', 'matcha', 'sugar'], income: 4, requiredRes: 0, limit: 'unlimited', likelyStage: 1 },
  { id: 'white', name: 'White Chocolate', ingredients: ['cocoa', 'milk', 'sugar', 'sugar'], income: 4, requiredRes: 0, limit: 'unlimited', likelyStage: 1 },
  { id: 'almond', name: 'Almond Chocolate', ingredients: ['cocoa', 'almond', 'sugar'], income: 3, requiredRes: 0, limit: 'unlimited', likelyStage: 2 },
  { id: 'coffee', name: 'Coffee Chocolate', ingredients: ['cocoa', 'coffee', 'sugar'], income: 4, requiredRes: 0, limit: 'unlimited', likelyStage: 2 },
  { id: 'caramel', name: 'Caramel Chocolate', ingredients: ['cocoa', 'caramel', 'sugar'], income: 6, requiredRes: 0, limit: 'unlimited', likelyStage: 2 },
  { id: 'extra_dark', name: 'Extra Dark Chocolate', ingredients: ['cocoa', 'cocoa', 'cocoa', 'sugar'], income: 5, requiredRes: 1, limit: 'unlimited', likelyStage: 2 },
  { id: 'cream_milk', name: 'Cream Milk Chocolate', ingredients: ['cocoa', 'milk', 'milk', 'sugar'], income: 5, requiredRes: 1, limit: 'unlimited', likelyStage: 2 },
  { id: 'milky_almond', name: 'Milky Almond Chocolate', ingredients: ['cocoa', 'milk', 'almond', 'sugar'], income: 6, requiredRes: 1, limit: 'unlimited', likelyStage: 2 },
  { id: 'mocha', name: 'Mocha Chocolate', ingredients: ['cocoa', 'milk', 'coffee', 'sugar'], income: 7, requiredRes: 1, limit: 'unlimited', likelyStage: 2 },
  { id: 'coffee_almond', name: 'Coffee with Almond Chocolate', ingredients: ['cocoa', 'coffee', 'almond', 'sugar'], income: 9, requiredRes: 1, limit: 'unlimited', likelyStage: 2 },
  { id: 'nutty_mocha', name: 'Nutty Mocha Chocolate', ingredients: ['cocoa', 'milk', 'almond', 'coffee', 'sugar'], income: 20, requiredRes: 2, limit: 'unlimited', likelyStage: 2 },
  { id: 'wild_berries', name: 'Wild Berries Chocolate', ingredients: ['cocoa', 'wild_berries', 'sugar'], income: 8, requiredRes: 1, limit: 'unlimited', likelyStage: 3 },
  { id: 'royal', name: 'Royal Chocolate', ingredients: ['cocoa', 'royal_honey', 'sugar'], income: 10, requiredRes: 1, limit: 'unlimited', likelyStage: 3 },
  { id: 'sea_salt', name: 'Sea Salt Chocolate', ingredients: ['cocoa', 'sea_salt', 'sugar'], income: 12, requiredRes: 2, limit: 'unlimited', likelyStage: 3 },
  { id: 'nutty_berries', name: 'Nutty Wild Berries Chocolate', ingredients: ['cocoa', 'almond', 'wild_berries', 'sugar'], income: 12, requiredRes: 1, limit: 'unlimited', likelyStage: 3 },
  { id: 'coffee_caramel', name: 'Coffee Caramel Chocolate', ingredients: ['cocoa', 'caramel', 'coffee', 'sugar'], income: 12, requiredRes: 1, limit: 'unlimited', likelyStage: 3 },
  { id: 'royal_milk', name: 'Royal Milk Chocolate', ingredients: ['cocoa', 'milk', 'royal_honey', 'sugar'], income: 15, requiredRes: 1, limit: 'unlimited', likelyStage: 3 },
  { id: 'salty_nut', name: 'Salty Nut Chocolate', ingredients: ['cocoa', 'sea_salt', 'almond', 'sugar'], income: 18, requiredRes: 2, limit: 'unlimited', likelyStage: 3 },
  { id: 'salty_caramel', name: 'Salty Caramel Chocolate', ingredients: ['cocoa', 'sea_salt', 'caramel', 'sugar'], income: 18, requiredRes: 2, limit: 'unlimited', likelyStage: 3 },
  { id: 'caramel_berries', name: 'Caramelized Wild Berries Chocolate', ingredients: ['cocoa', 'wild_berries', 'caramel', 'sugar'], income: 20, requiredRes: 2, limit: 'unlimited', likelyStage: 3 },
  { id: 'royal_berries', name: 'Royal Wild Berries Chocolate', ingredients: ['cocoa', 'wild_berries', 'royal_honey', 'sugar'], income: 25, requiredRes: 2, limit: 'unlimited', likelyStage: 3 },
  { id: 'royal_caramel', name: 'Royal Caramel Chocolate', ingredients: ['cocoa', 'caramel', 'royal_honey', 'sugar'], income: 25, requiredRes: 2, limit: 'unlimited', likelyStage: 3 },
  { id: 'royal_mocha', name: 'Royal Mocha Chocolate', ingredients: ['cocoa', 'milk', 'coffee', 'royal_honey', 'sugar'], income: 35, requiredRes: 3, limit: 'unlimited', likelyStage: 3 },
  { id: 'exotics_assorted', name: 'Exotics Assorted Mix', ingredients: ['cocoa', 'caramel', 'wild_berries', 'sea_salt', 'sugar'], income: 40, requiredRes: 3, limit: 'unlimited', likelyStage: 3 },
  { id: 'royal_assorted', name: 'Royal Assorted Mix', ingredients: ['cocoa', 'coffee', 'almond', 'wild_berries', 'caramel', 'royal_honey'], income: 60, requiredRes: 3, limit: 'unlimited', likelyStage: 3 },
]

export const SLOT_FACE_BY_STAGE = { 1: 5, 2: 10, 3: 15 } as const
export const REP_SLOT_L1_COST = 5
export const REP_SLOT_L2_COST = 10
export const REP_FACTORY_COST = 20
export const REP_JUNIOR_COST = 4
export const REP_SENIOR_COST = 10
export const MASTERY_COST = 50
export const DISCARD_PAY = { 1: 4, 2: 8, 3: 12 } as const
export const OPEN_MARKET_PAY = { 1: 5, 2: 10, 3: 15 } as const
export const RELIEF_RES = { 1: 1, 2: 2 } as const
export const RELIEF_REP = { 1: 2, 2: 3 } as const
export const RELIEF_CASH = { 1: 10, 2: 20 } as const
export const RELIEF_PENALTY = { 1: 25, 2: 50 } as const

export const CARD_FACE: Record<string, number> = {
  'Basic Cocoa': 1,
  Sugar: 1,
  'Basic Milk': 3,
  Matcha: 12,
  'Junior Researcher': 4,
  'Junior Journalist': 4,
  'Extra Ingredient Slot': SLOT_FACE_BY_STAGE[1],
  'Premium Cocoa': 8,
  'Premium Sugar': 8,
  Coffee: 16,
  'Senior Researcher': 10,
  Almond: 12,
  'Senior Journalist': 10,
  'Master Researcher': 24,
  'Wild Berries': 30,
  Caramel: 30,
  'Premium Milk': 14,
  'Master Journalist': 24,
  'Sea Salt': 24,
  Masteries: MASTERY_COST,
  'Royal Honey': 60,
  'Premium Coffee': 32,
  'Premium Almond': 24,
}

export function premiumPay(card: GameCard): number {
  if (!card.premium || !card.family) return 0
  if (card.family === 'coffee' || card.family === 'almond') return 2
  return 1
}

export function hazardousPenalty(stage: number): number {
  if (stage === 2) return 2
  if (stage === 3) return 3
  return 1
}

export function discardPay(stage: number): number {
  if (stage === 2 || stage === 3) return DISCARD_PAY[stage]
  return DISCARD_PAY[1]
}

export function openMarketPay(stage: number): number {
  if (stage === 2 || stage === 3) return OPEN_MARKET_PAY[stage]
  return OPEN_MARKET_PAY[1]
}

export function slotFace(stage: number): number {
  if (stage === 2 || stage === 3) return SLOT_FACE_BY_STAGE[stage]
  return SLOT_FACE_BY_STAGE[1]
}

export const CARD_CATALOG: {
  name: string
  kind: string
  cost: number
  stages: [string, string, string]
  notes: string
}[] = [
  { name: 'Basic Cocoa', kind: 'Supply', cost: CARD_FACE['Basic Cocoa'], stages: ['2×n', '—', '—'], notes: 'Open Market also stocks Cocoa' },
  { name: 'Sugar', kind: 'Supply', cost: CARD_FACE.Sugar, stages: ['2×n', '—', '—'], notes: 'Open Market also stocks Sugar' },
  { name: 'Basic Milk', kind: 'Supply', cost: CARD_FACE['Basic Milk'], stages: ['1×n', '—', '—'], notes: '' },
  { name: 'Matcha', kind: 'Supply', cost: CARD_FACE.Matcha, stages: ['1×n', '—', '—'], notes: 'Mostly Stage 1 recipes' },
  { name: 'Junior Researcher', kind: 'Research', cost: CARD_FACE['Junior Researcher'], stages: ['1×n', '—', '—'], notes: '+1 ResP' },
  { name: 'Junior Journalist', kind: 'Reputation', cost: CARD_FACE['Junior Journalist'], stages: ['1×n', '—', '—'], notes: '+2 Rep' },
  { name: 'Extra Ingredient Slot', kind: 'Upgrade', cost: CARD_FACE['Extra Ingredient Slot'], stages: ['1×n', '1×n', '1×n'], notes: 'Face $5/$10/$15M in Stages 1–3' },
  { name: 'Premium Cocoa', kind: 'Supply', cost: CARD_FACE['Premium Cocoa'], stages: ['—', '1×n', '—'], notes: 'Counts as Cocoa, +$1M to that factory' },
  { name: 'Premium Sugar', kind: 'Supply', cost: CARD_FACE['Premium Sugar'], stages: ['—', '1×n', '—'], notes: 'Counts as Sugar, +$1M to that factory' },
  { name: 'Coffee', kind: 'Supply', cost: CARD_FACE.Coffee, stages: ['—', '1×n', '—'], notes: '' },
  { name: 'Senior Researcher', kind: 'Research', cost: CARD_FACE['Senior Researcher'], stages: ['—', '1×n', '—'], notes: '+2 ResP' },
  { name: 'Almond', kind: 'Supply', cost: CARD_FACE.Almond, stages: ['—', '1×n', '—'], notes: '' },
  { name: 'Senior Journalist', kind: 'Reputation', cost: CARD_FACE['Senior Journalist'], stages: ['—', '1×n', '—'], notes: '+3 Rep' },
  { name: 'Caramel', kind: 'Supply', cost: CARD_FACE.Caramel, stages: ['—', '1×n', '1×n'], notes: 'Enters in Stage 2' },
  { name: 'Premium Milk', kind: 'Supply', cost: CARD_FACE['Premium Milk'], stages: ['—', '1×n', '—'], notes: 'Counts as Milk, +$1M to that factory' },
  { name: 'Master Researcher', kind: 'Research', cost: CARD_FACE['Master Researcher'], stages: ['—', '—', '1×n'], notes: '+3 ResP' },
  { name: 'Wild Berries', kind: 'Supply', cost: CARD_FACE['Wild Berries'], stages: ['—', '—', '1×n'], notes: '' },
  { name: 'Premium Coffee', kind: 'Supply', cost: CARD_FACE['Premium Coffee'], stages: ['—', '—', '1×n'], notes: 'Counts as Coffee, +$2M to that factory' },
  { name: 'Premium Almond', kind: 'Supply', cost: CARD_FACE['Premium Almond'], stages: ['—', '—', '1×n'], notes: 'Counts as Almond, +$2M to that factory' },
  { name: 'Master Journalist', kind: 'Reputation', cost: CARD_FACE['Master Journalist'], stages: ['—', '—', '1×n'], notes: '+4 Rep' },
  { name: 'Royal Honey', kind: 'Supply', cost: CARD_FACE['Royal Honey'], stages: ['—', '—', '1×n'], notes: '' },
  { name: 'Sea Salt', kind: 'Supply', cost: CARD_FACE['Sea Salt'], stages: ['—', '—', '1×n'], notes: 'Recipes using it need Research L2' },
  { name: 'Masteries', kind: 'Mastery', cost: CARD_FACE.Masteries, stages: ['n revealed', '—', '—'], notes: 'Shared $50M pool; Research L3 to buy; one per player' },
]

export function firstAvailableStage(stages: [string, string, string]): 1 | 2 | 3 {
  const idx = stages.findIndex((s) => s !== '—')
  return ((idx < 0 ? 0 : idx) + 1) as 1 | 2 | 3
}

export function recipesUsing(family: IngredientFamily): Recipe[] {
  return RECIPES.filter((r) => r.ingredients.includes(family))
}

export const INGREDIENT_GUIDE = CARD_CATALOG.filter((c) => c.kind === 'Supply').map((c) => ({
  name: c.name,
  cost: c.cost,
  firstStage: firstAvailableStage(c.stages),
  notes: c.notes,
}))

export const STAGE_INGREDIENTS = [
  'Stage 1: Cocoa, Sugar, Milk, Matcha',
  'Stage 2: the above + Coffee, Almond, Caramel, Premium Cocoa, Premium Sugar, Premium Milk',
  'Stage 3: the above + Wild Berries, Sea Salt, Royal Honey, Premium Coffee, Premium Almond',
]

export function recipeById(id: string): Recipe {
  const r = RECIPES.find((x) => x.id === id)
  if (!r) throw new Error(`Unknown recipe ${id}`)
  return r
}

export function factoryLimit(_recipe: Recipe, _n: number): number {
  return 99
}

export const MASTERY_INFO: Record<MasteryId, { name: string; text: string }> = {
  chocolatier: {
    name: 'Chocolatier',
    text: 'Score +5 for every recipe you developed this game.',
  },
  exotics_master: {
    name: 'Exotics Master',
    text: 'Score +120 if you have a factory producing a Research L3 recipe at the end of the game.',
  },
  heritage_line: {
    name: 'Heritage Line',
    text: 'Score 6× the production value of your factories making recipes that need Research L1 or below.',
  },
  masterchef: {
    name: 'Masterchef',
    text: 'Score +15 for every unique ingredient in your factories at the end of the game.',
  },
  experimentalist: {
    name: 'Experimentalist',
    text: 'Score +120 if you have the most Research Points outright at the end of the game.',
  },
  brand_ambassador: {
    name: 'Brand Ambassador',
    text: 'Score +120 if you have the most Reputation outright at the end of the game.',
  },
  tycoon: {
    name: 'Tycoon',
    text: 'Score 1 point per $M of factory income on the last turn, plus +50 if that factory income is highest.',
  },
}

export const ALL_MASTERY_IDS = Object.keys(MASTERY_INFO) as MasteryId[]

export const SCHEME_INFO: Record<
  SchemeId,
  { name: string; text: string; playCost: '1' | '2' | 'stage' | 'stage_plus_1' }
> = {
  artificial_shortage: {
    name: 'Artificial Shortage',
    text: 'Choose any ingredient. Every player loses 1 copy of that ingredient from Supply. Factories are untouched.',
    playCost: 'stage',
  },
  black_market: {
    name: 'Black Market',
    text: 'Take one card from the public Discard for free.',
    playCost: 'stage_plus_1',
  },
  defamation_ops: {
    name: 'Defamation Ops',
    text: 'Steal 2 Reputation from the Most Reputable player and 1 from every other player. Your factories pay $0 this turn. Unplayable if the title is vacant or you hold it.',
    playCost: '1',
  },
  double_agent: {
    name: 'Double Agent',
    text: 'Choose two other players. Look at their hands and swap one hand card with each of them.',
    playCost: '2',
  },
  embargo: {
    name: 'Embargo',
    text: 'Choose an ingredient other than Cocoa or Sugar. Recipes using it pay $0 this turn and next turn.',
    playCost: '1',
  },
  embezzlement: {
    name: 'Embezzlement',
    text: 'Each other player pays you $3/$6/$9M in Stages 1–3. Players who cannot pay in full pay all cash they have.',
    playCost: '1',
  },
  forced_swap: {
    name: 'Forced Swap',
    text: 'Swap one Supply card with another player. If yours costs more, pay the difference to that player.',
    playCost: 'stage',
  },
  hazardous_warehousing: {
    name: 'Hazardous Warehousing',
    text: 'Bank an extra factory slot. Any factory using it pays −$1/−$2/−$3M in Stages 1–3 (current stage).',
    playCost: '1',
  },
  hostile_takeover: {
    name: 'Hostile Takeover',
    text: 'You are Most Reputable for this turn and the next 2, overriding the usual title rules.',
    playCost: '1',
  },
  labour_exploitation: {
    name: 'Labour Exploitation',
    text: 'Your factory income is doubled this turn, then $0 next turn.',
    playCost: '1',
  },
  money_laundering: {
    name: 'Money Laundering',
    text: 'Gain $15/$25/$35M from the Bank in Stages 1–3.',
    playCost: '1',
  },
  press_leak: {
    name: 'Press Leak',
    text: 'Choose exactly 2 other players. Look at their Schemes. For each who has 2 or more Schemes, you may discard one of theirs to the Scheme discard.',
    playCost: '2',
  },
  price_gouging: {
    name: 'Price Gouging',
    text: 'Choose an ingredient other than Cocoa or Sugar. Recipes using it pay half their printed income (rounded down) this turn and the next 2.',
    playCost: '1',
  },
  private_viewing: {
    name: 'Private Viewing',
    text: 'Play only during the Private Viewing window. You cut the purchasing queue. Multiple viewers resolve in current turn order. Counts as your Scheme play for the turn.',
    playCost: '2',
  },
  secret_project: {
    name: 'Secret Project',
    text: 'Gain +2 Research Points. Your factories pay $0 this turn.',
    playCost: '1',
  },
  synthetic_ingredient: {
    name: 'Synthetic Ingredient',
    text: 'Choose any ingredient an opponent has in Supply or a factory. Gain a copy of it. The copy cannot be changed later.',
    playCost: 'stage',
  },
  unethical_research: {
    name: 'Unethical Research',
    text: 'Gain +1 Research Point.',
    playCost: '1',
  },
  unlicensed_chef: {
    name: 'Unlicensed Chef',
    text: 'Choose a recipe. You may ignore its Research requirement for the rest of the game.',
    playCost: '1',
  },
  veto_power: {
    name: 'Veto Power',
    text: 'Cancel a Scheme as it is played. Does not count as your Scheme play. The cancelled Scheme costs nothing.',
    playCost: '1',
  },
}

export const SCHEME_IDS = (Object.keys(SCHEME_INFO) as SchemeId[]).sort((a, b) =>
  SCHEME_INFO[a].name.localeCompare(SCHEME_INFO[b].name),
)

export function schemePlayCost(id: SchemeId, _playerCount: number, stage: number): number {
  const kind = SCHEME_INFO[id].playCost
  if (kind === 'stage') return stage
  if (kind === 'stage_plus_1') return stage + 1
  return Number(kind)
}

function ingredient(
  name: string,
  family: IngredientFamily,
  cost: number,
  stage: 0 | 1 | 2 | 3,
  premium = false,
): GameCard {
  return {
    uid: uid('c'),
    kind: 'ingredient',
    name,
    family,
    cost,
    stage,
    premium,
  }
}

function researcher(name: string, cost: number, stage: 1 | 2 | 3, resP: number): GameCard {
  return { uid: uid('c'), kind: 'researcher', name, cost, stage, resP }
}

function journalist(name: string, cost: number, stage: 1 | 2 | 3, repP: number): GameCard {
  return { uid: uid('c'), kind: 'journalist', name, cost, stage, repP }
}

function slot(stage: 1 | 2 | 3): GameCard {
  return { uid: uid('c'), kind: 'slot', name: 'Extra Ingredient Slot', cost: slotFace(stage), stage }
}

export function masteryCard(id: MasteryId): GameCard {
  return {
    uid: uid('c'),
    kind: 'mastery',
    name: MASTERY_INFO[id].name,
    cost: CARD_FACE.Masteries,
    stage: 1,
    masteryId: id,
  }
}

export function startingSupply(): GameCard[] {
  return [ingredient('Basic Cocoa', 'cocoa', 1, 1), ingredient('Sugar', 'sugar', 1, 1)]
}

export function openMarketCard(item: 'cocoa' | 'sugar'): GameCard {
  if (item === 'cocoa') return ingredient('Basic Cocoa', 'cocoa', 1, 0)
  return ingredient('Sugar', 'sugar', 1, 0)
}

export function syntheticCopy(family: IngredientFamily): GameCard {
  return {
    uid: uid('c'),
    kind: 'ingredient',
    name: `Synthetic ${INGREDIENT_LABEL[family]}`,
    family,
    cost: 0,
    stage: 0,
    synthetic: true,
  }
}

export function hazardousSlot(): GameCard {
  return {
    uid: uid('c'),
    kind: 'slot',
    name: 'Hazardous Warehousing',
    cost: 0,
    stage: 0,
    hazardous: true,
  }
}

type StageSpec = { copies: (n: number) => number; make: () => GameCard }

function stageSpecs(stage: 1 | 2 | 3): StageSpec[] {
  if (stage === 1) {
    return [
      { copies: (n) => 2 * n, make: () => ingredient('Basic Cocoa', 'cocoa', CARD_FACE['Basic Cocoa'], 1) },
      { copies: (n) => 2 * n, make: () => ingredient('Sugar', 'sugar', CARD_FACE.Sugar, 1) },
      { copies: (n) => n, make: () => ingredient('Basic Milk', 'milk', CARD_FACE['Basic Milk'], 1) },
      { copies: (n) => n, make: () => ingredient('Matcha', 'matcha', CARD_FACE.Matcha, 1) },
      { copies: (n) => n, make: () => researcher('Junior Researcher', CARD_FACE['Junior Researcher'], 1, 1) },
      { copies: (n) => n, make: () => journalist('Junior Journalist', CARD_FACE['Junior Journalist'], 1, 2) },
      { copies: (n) => n, make: () => slot(1) },
    ]
  }
  if (stage === 2) {
    return [
      { copies: (n) => n, make: () => slot(2) },
      { copies: (n) => n, make: () => ingredient('Premium Cocoa', 'cocoa', CARD_FACE['Premium Cocoa'], 2, true) },
      { copies: (n) => n, make: () => ingredient('Premium Sugar', 'sugar', CARD_FACE['Premium Sugar'], 2, true) },
      { copies: (n) => n, make: () => ingredient('Coffee', 'coffee', CARD_FACE.Coffee, 2) },
      { copies: (n) => n, make: () => researcher('Senior Researcher', CARD_FACE['Senior Researcher'], 2, 2) },
      { copies: (n) => n, make: () => ingredient('Almond', 'almond', CARD_FACE.Almond, 2) },
      { copies: (n) => n, make: () => journalist('Senior Journalist', CARD_FACE['Senior Journalist'], 2, 3) },
      { copies: (n) => n, make: () => ingredient('Caramel', 'caramel', CARD_FACE.Caramel, 2) },
      { copies: (n) => n, make: () => ingredient('Premium Milk', 'milk', CARD_FACE['Premium Milk'], 2, true) },
    ]
  }
  return [
    { copies: (n) => n, make: () => slot(3) },
    { copies: (n) => n, make: () => researcher('Master Researcher', CARD_FACE['Master Researcher'], 3, 3) },
    { copies: (n) => n, make: () => ingredient('Wild Berries', 'wild_berries', CARD_FACE['Wild Berries'], 3) },
    { copies: (n) => n, make: () => ingredient('Caramel', 'caramel', CARD_FACE.Caramel, 3) },
    { copies: (n) => n, make: () => ingredient('Premium Coffee', 'coffee', CARD_FACE['Premium Coffee'], 3, true) },
    { copies: (n) => n, make: () => ingredient('Premium Almond', 'almond', CARD_FACE['Premium Almond'], 3, true) },
    { copies: (n) => n, make: () => journalist('Master Journalist', CARD_FACE['Master Journalist'], 3, 4) },
    { copies: (n) => n, make: () => ingredient('Royal Honey', 'royal_honey', CARD_FACE['Royal Honey'], 3) },
    { copies: (n) => n, make: () => ingredient('Sea Salt', 'sea_salt', CARD_FACE['Sea Salt'], 3) },
  ]
}

export function buildStageDeck(stage: 1 | 2 | 3, n: number): GameCard[] {
  const cards: GameCard[] = []
  for (const spec of stageSpecs(stage)) {
    const count = spec.copies(n)
    for (let i = 0; i < count; i += 1) cards.push(spec.make())
  }
  return cards
}

export function buildSchemeDeck(): SchemeCard[] {
  const cards: SchemeCard[] = []
  for (const id of SCHEME_IDS) {
    const copies = id === 'veto_power' ? 4 : 2
    for (let i = 0; i < copies; i += 1) {
      cards.push({ uid: uid('s'), schemeId: id, name: SCHEME_INFO[id].name })
    }
  }
  return cards
}

export function emptyBreakdown() {
  return { factories: 0, research: 0, reputation: 0, masteries: 0, total: 0 }
}
