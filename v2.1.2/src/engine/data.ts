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
  strawberry: 'Strawberry',
  sea_salt: 'Sea Salt',
  royal_honey: 'Royal Honey',
}

export const PREMIUM_FAMILIES = new Set<IngredientFamily>([
  'cocoa',
  'milk',
  'coffee',
  'almond',
])

export function familyOf(card: GameCard): IngredientFamily | undefined {
  return card.family
}

export const RECIPES: Recipe[] = [
  { id: 'basic', name: 'Basic Chocolate', ingredients: ['cocoa', 'sugar'], income: 1, tier: 1, limit: 'unlimited', likelyStage: 1 },
  { id: 'dark', name: 'Dark Chocolate', ingredients: ['cocoa', 'cocoa', 'sugar'], income: 2, tier: 1, limit: 'n+1', likelyStage: 1 },
  { id: 'milk', name: 'Milk Chocolate', ingredients: ['cocoa', 'milk', 'sugar'], income: 2, tier: 1, limit: 'n+1', likelyStage: 1 },
  { id: 'matcha', name: 'Matcha Chocolate', ingredients: ['cocoa', 'matcha', 'sugar'], income: 4, tier: 1, limit: 'by-count', likelyStage: 1 },
  { id: 'white', name: 'White Chocolate', ingredients: ['cocoa', 'milk', 'sugar', 'sugar'], income: 4, tier: 1, limit: 'n+1', likelyStage: 1 },
  { id: 'extra_dark', name: 'Extra Dark Chocolate', ingredients: ['cocoa', 'cocoa', 'cocoa', 'sugar'], income: 5, tier: 2, limit: 'n+1', likelyStage: 2 },
  { id: 'coffee', name: 'Coffee Chocolate', ingredients: ['cocoa', 'coffee', 'sugar'], income: 4, tier: 1, limit: 'n', likelyStage: 2 },
  { id: 'almond', name: 'Almond Chocolate', ingredients: ['cocoa', 'almond', 'sugar'], income: 3, tier: 1, limit: 'n', likelyStage: 2 },
  { id: 'mocha', name: 'Mocha Chocolate', ingredients: ['cocoa', 'milk', 'coffee', 'sugar'], income: 6, tier: 2, limit: 'n', likelyStage: 2 },
  { id: 'milky_almond', name: 'Milky Almond Chocolate', ingredients: ['cocoa', 'milk', 'almond', 'sugar'], income: 5, tier: 2, limit: 'n', likelyStage: 2 },
  { id: 'coffee_almond', name: 'Coffee with Almond Chocolate', ingredients: ['cocoa', 'coffee', 'almond', 'sugar'], income: 8, tier: 2, limit: 'n', likelyStage: 2 },
  { id: 'wild_berries', name: 'Wild Berries Chocolate', ingredients: ['cocoa', 'wild_berries', 'sugar'], income: 8, tier: 2, limit: 'n', likelyStage: 3 },
  { id: 'caramel', name: 'Caramel Chocolate', ingredients: ['cocoa', 'caramel', 'sugar'], income: 8, tier: 2, limit: 'n', likelyStage: 3 },
  { id: 'strawberry', name: 'Strawberry Chocolate', ingredients: ['cocoa', 'strawberry', 'sugar'], income: 8, tier: 2, limit: 'n', likelyStage: 3 },
  { id: 'sea_salt', name: 'Sea Salt Chocolate', ingredients: ['cocoa', 'sea_salt', 'sugar'], income: 10, tier: 3, limit: 'n', likelyStage: 3 },
  { id: 'milky_caramel', name: 'Milky Caramel Chocolate', ingredients: ['cocoa', 'milk', 'caramel', 'sugar'], income: 12, tier: 2, limit: 'n-1', likelyStage: 3 },
  { id: 'caramel_berries', name: 'Caramelized Wild Berries Chocolate', ingredients: ['cocoa', 'wild_berries', 'caramel', 'sugar'], income: 20, tier: 3, limit: 'n-1', likelyStage: 3 },
  { id: 'nutty_berries', name: 'Nutty Wild Berries Chocolate', ingredients: ['cocoa', 'almond', 'wild_berries', 'sugar'], income: 12, tier: 2, limit: 'n-1', likelyStage: 3 },
  { id: 'coffee_caramel', name: 'Coffee Caramel Chocolate', ingredients: ['cocoa', 'caramel', 'coffee', 'sugar'], income: 12, tier: 2, limit: 'n-1', likelyStage: 3 },
  { id: 'salty_caramel', name: 'Salty Caramel Chocolate', ingredients: ['cocoa', 'sea_salt', 'caramel', 'sugar'], income: 18, tier: 3, limit: 'n-1', likelyStage: 3 },
  { id: 'assorted_berry', name: 'Assorted Berry Chocolate', ingredients: ['cocoa', 'strawberry', 'wild_berries', 'sugar'], income: 15, tier: 3, limit: 'n-1', likelyStage: 3 },
  { id: 'salty_nut', name: 'Salty Nut Chocolate', ingredients: ['cocoa', 'sea_salt', 'almond', 'sugar'], income: 15, tier: 3, limit: 'n-1', likelyStage: 3 },
  { id: 'matcha_strawberry', name: 'Matcha Strawberry Chocolate', ingredients: ['cocoa', 'strawberry', 'matcha', 'sugar'], income: 13, tier: 2, limit: 'n-1', likelyStage: 3 },
  { id: 'salty_strawberry', name: 'Salty Strawberry Chocolate', ingredients: ['cocoa', 'strawberry', 'sea_salt', 'sugar'], income: 20, tier: 3, limit: 'by-count', likelyStage: 3 },
  { id: 'mocha_caramel', name: 'Mocha Caramel Chocolate', ingredients: ['cocoa', 'caramel', 'coffee', 'milk', 'sugar'], income: 28, tier: 3, limit: 'by-count', likelyStage: 3 },
  { id: 'caramel_nutty_berries', name: 'Caramelized Nutty Wild Berries Chocolate', ingredients: ['cocoa', 'wild_berries', 'almond', 'caramel', 'sugar'], income: 33, tier: 3, limit: 'by-count', likelyStage: 3 },
  { id: 'royal_dark', name: 'Royal Dark Chocolate', ingredients: ['cocoa', 'cocoa', 'royal_honey', 'sugar'], income: 20, tier: 3, limit: 'n', likelyStage: 4 },
  { id: 'royal_matcha', name: 'Royal Milky & Nutty Matcha Chocolate', ingredients: ['cocoa', 'matcha', 'milk', 'almond', 'royal_honey'], income: 30, tier: 3, limit: 'by-count', likelyStage: 4 },
  { id: 'royal_mocha_caramel', name: 'Royal Glazed Mocha Caramel Chocolate', ingredients: ['cocoa', 'caramel', 'coffee', 'milk', 'royal_honey'], income: 45, tier: 3, limit: 'by-count', likelyStage: 4 },
  { id: 'royal_caramel_berries', name: 'Royal Glazed Caramelized Nutty Wild Berries Chocolate', ingredients: ['cocoa', 'wild_berries', 'almond', 'caramel', 'royal_honey'], income: 45, tier: 3, limit: 'by-count', likelyStage: 4 },
  { id: 'royal_strawberry', name: 'Royal Milky & Nutty Strawberry Chocolate', ingredients: ['cocoa', 'strawberry', 'milk', 'almond', 'royal_honey'], income: 45, tier: 3, limit: 'by-count', likelyStage: 4 },
  { id: 'royal_salty_coffee', name: 'Royal Milky & Salty Coffee Chocolate', ingredients: ['cocoa', 'sea_salt', 'milk', 'coffee', 'royal_honey'], income: 45, tier: 3, limit: 'by-count', likelyStage: 4 },
  { id: 'royal_assorted', name: 'Royal Assorted Mix', ingredients: ['cocoa', 'coffee', 'almond', 'wild_berries', 'caramel', 'royal_honey'], income: 65, tier: 4, limit: 'by-count', likelyStage: 4 },
  { id: 'royal_salty_berry', name: 'Royal Salty Berry Chocolate', ingredients: ['cocoa', 'wild_berries', 'strawberry', 'sea_salt', 'caramel', 'royal_honey'], income: 80, tier: 4, limit: 'by-count', likelyStage: 4 },
]

export const SLOT_FACE_BY_STAGE = { 1: 5, 2: 10, 3: 15, 4: 20 } as const
export const REP_SLOT_L1_COST = 5
export const REP_SLOT_L2_COST = 10
export const REP_FACTORY_COST = 20
export const DISCARD_PAY = { 1: 5, 2: 10, 3: 15, 4: 20 } as const
export const RELIEF_RES = { 1: 1, 2: 2, 3: 3 } as const
export const RELIEF_REP = { 1: 2, 2: 3, 3: 4 } as const
export const RELIEF_CASH = { 1: 10, 2: 20, 3: 30 } as const
export const RELIEF_PENALTY = { 1: 25, 2: 50, 3: 75 } as const

export const CARD_FACE: Record<string, number> = {
  'Basic Cocoa': 1,
  Sugar: 1,
  'Basic Milk': 3,
  Matcha: 8,
  'Junior Researcher': 4,
  'Junior Journalist': 4,
  'Extra Ingredient Slot': SLOT_FACE_BY_STAGE[1],
  'Premium Cocoa': 8,
  Coffee: 16,
  'Senior Researcher': 10,
  Almond: 12,
  'Senior Journalist': 10,
  'Master Researcher': 24,
  'Wild Berries': 30,
  Caramel: 30,
  'Premium Milk': 24,
  'Master Journalist': 24,
  Strawberry: 18,
  'Sea Salt': 18,
  Masteries: 48,
  'Royal Honey': 60,
  'Premium Coffee': 40,
  'Premium Almond': 30,
}

export function premiumPay(card: GameCard): number {
  if (!card.premium || !card.family) return 0
  if (card.family === 'milk') return 2
  if (card.family === 'coffee' || card.family === 'almond') return 3
  return 1
}

export function discardPay(stage: number): number {
  if (stage === 2 || stage === 3 || stage === 4) return DISCARD_PAY[stage]
  return DISCARD_PAY[1]
}

export function slotFace(stage: number): number {
  if (stage === 2 || stage === 3 || stage === 4) return SLOT_FACE_BY_STAGE[stage]
  return SLOT_FACE_BY_STAGE[1]
}

export const CARD_CATALOG: {
  name: string
  kind: string
  cost: number
  stages: [string, string, string, string]
  notes: string
}[] = [
  { name: 'Basic Cocoa', kind: 'Supply', cost: CARD_FACE['Basic Cocoa'], stages: ['3×n', '1×n', '—', '—'], notes: 'Open Market also stocks Cocoa' },
  { name: 'Sugar', kind: 'Supply', cost: CARD_FACE.Sugar, stages: ['2×n', '2×n', '—', '—'], notes: 'Open Market also stocks Sugar' },
  { name: 'Basic Milk', kind: 'Supply', cost: CARD_FACE['Basic Milk'], stages: ['1×n', '1×n', '—', '—'], notes: '' },
  { name: 'Matcha', kind: 'Supply', cost: CARD_FACE.Matcha, stages: ['1×n', '—', '—', '—'], notes: '' },
  { name: 'Junior Researcher', kind: 'Research', cost: CARD_FACE['Junior Researcher'], stages: ['1×n', '—', '—', '—'], notes: '+1 ResP' },
  { name: 'Junior Journalist', kind: 'Reputation', cost: CARD_FACE['Junior Journalist'], stages: ['1×n', '—', '—', '—'], notes: '+2 Rep' },
  { name: 'Extra Ingredient Slot', kind: 'Upgrade', cost: CARD_FACE['Extra Ingredient Slot'], stages: ['1×n', '1×n', '1×n', '1×n'], notes: 'Face $5/$10/$15/$20M in Stages 1–4. Assignable extra factory slot' },
  { name: 'Premium Cocoa', kind: 'Supply', cost: CARD_FACE['Premium Cocoa'], stages: ['—', '1×n', '—', '—'], notes: 'Counts as Cocoa, +$1M to that factory' },
  { name: 'Coffee', kind: 'Supply', cost: CARD_FACE.Coffee, stages: ['—', '1×n', '1×n', '—'], notes: '' },
  { name: 'Senior Researcher', kind: 'Research', cost: CARD_FACE['Senior Researcher'], stages: ['—', '1×n', '—', '—'], notes: '+2 ResP' },
  { name: 'Almond', kind: 'Supply', cost: CARD_FACE.Almond, stages: ['—', '1×n', '1×n', '—'], notes: '' },
  { name: 'Senior Journalist', kind: 'Reputation', cost: CARD_FACE['Senior Journalist'], stages: ['—', '1×n', '—', '—'], notes: '+3 Rep' },
  { name: 'Master Researcher', kind: 'Research', cost: CARD_FACE['Master Researcher'], stages: ['—', '—', '1×n', '2×n'], notes: '+3 ResP' },
  { name: 'Wild Berries', kind: 'Supply', cost: CARD_FACE['Wild Berries'], stages: ['—', '—', '1×n', '1×n'], notes: '' },
  { name: 'Caramel', kind: 'Supply', cost: CARD_FACE.Caramel, stages: ['—', '—', '1×n', '1×n'], notes: '' },
  { name: 'Premium Milk', kind: 'Supply', cost: CARD_FACE['Premium Milk'], stages: ['—', '—', '1×n', '—'], notes: 'Counts as Milk, +$2M to that factory' },
  { name: 'Master Journalist', kind: 'Reputation', cost: CARD_FACE['Master Journalist'], stages: ['—', '—', '1×n', '1×n'], notes: '+5 Rep' },
  { name: 'Strawberry', kind: 'Supply', cost: CARD_FACE.Strawberry, stages: ['—', '—', '1×n', '—'], notes: 'Requires Reputation L2 to buy from the pool' },
  { name: 'Sea Salt', kind: 'Supply', cost: CARD_FACE['Sea Salt'], stages: ['—', '—', '1×n', '—'], notes: 'Requires Research L2 to buy from the pool' },
  { name: 'Masteries', kind: 'Mastery', cost: CARD_FACE.Masteries, stages: ['—', '—', '—', '1×n'], notes: 'n random unique Masteries; needs Res L3 or Rep L3' },
  { name: 'Royal Honey', kind: 'Supply', cost: CARD_FACE['Royal Honey'], stages: ['—', '—', '—', '1×n'], notes: '' },
  { name: 'Premium Coffee', kind: 'Supply', cost: CARD_FACE['Premium Coffee'], stages: ['—', '—', '—', '1×n'], notes: 'Counts as Coffee, +$3M to that factory' },
  { name: 'Premium Almond', kind: 'Supply', cost: CARD_FACE['Premium Almond'], stages: ['—', '—', '—', '1×n'], notes: 'Counts as Almond, +$3M to that factory' },
]

export function firstAvailableStage(stages: [string, string, string, string]): 1 | 2 | 3 | 4 {
  const idx = stages.findIndex((s) => s !== '—')
  return ((idx < 0 ? 0 : idx) + 1) as 1 | 2 | 3 | 4
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
  'Stage 2: the above + Coffee, Almond, Premium Cocoa',
  'Stage 3: the above + Wild Berries, Caramel, Strawberry, Sea Salt, Premium Milk',
  'Stage 4: the above + Royal Honey, Premium Coffee, Premium Almond, Masteries',
]

export function recipeById(id: string): Recipe {
  const r = RECIPES.find((x) => x.id === id)
  if (!r) throw new Error(`Unknown recipe ${id}`)
  return r
}

export function factoryLimit(recipe: Recipe, n: number): number {
  if (recipe.limit === 'unlimited') return 99
  if (recipe.limit === 'n+1') return n + 1
  if (recipe.limit === 'n') return n
  if (recipe.limit === 'n-1') return Math.max(1, n - 1)
  if (recipe.limit === 'n-2') return Math.max(1, n - 2)
  if (n <= 4) return 2
  if (n === 5) return 3
  return 4
}

export const MASTERY_INFO: Record<MasteryId, { name: string; text: string }> = {
  chocolatier: {
    name: 'Chocolatier',
    text: 'Each Cocoa in your factories is worth +$3M.',
  },
  exotics_master: {
    name: 'Exotics Master',
    text: 'Your most valuable Tier 3 product is worth double.',
  },
  jack_of_all_trades: {
    name: 'Jack of All Trades',
    text: 'One Tier 1 / 2 / 3 product you have is worth +$3M / +$6M / +$9M.',
  },
  heritage_line: {
    name: 'Heritage Line',
    text: 'Double one of your Tier 1 products and one of your Tier 2 products.',
  },
  gourmet_pantry: {
    name: 'Gourmet Pantry',
    text: 'Each Strawberry, Sea Salt, Wild Berries, and Caramel in your factories is worth +$4M.',
  },
  experimentalist: {
    name: 'Experimentalist',
    text: '+$25M production if you have the highest Research Level, otherwise +$10M.',
  },
  brand_ambassador: {
    name: 'Brand Ambassador',
    text: '+$25M production if you have the highest Reputation Level, otherwise +$10M.',
  },
}

export const ALL_MASTERY_IDS = Object.keys(MASTERY_INFO) as MasteryId[]

export const SCHEME_INFO: Record<
  SchemeId,
  { name: string; text: string; playCost: '1' | '2' | 'players' | 'stage' | 'playersMinus2' | 'stagePlus1' }
> = {
  forced_swap: {
    name: 'Forced Swap',
    text: 'Swap one Supply card with another player. If yours costs more, pay the difference to that player.',
    playCost: 'stage',
  },
  private_viewing: {
    name: 'Private Viewing',
    text: 'Play only during the Private Viewing window before Purchasing. You pick first this Purchasing phase. Counts as your Scheme play for the turn.',
    playCost: '2',
  },
  patent_lawsuit: {
    name: 'Patent Lawsuit',
    text: 'Choose one recipe you produce. Each matching opponent factory pays $2/$4/$6/$8M to the Bank in Stages 1–4.',
    playCost: 'playersMinus2',
  },
  black_market: {
    name: 'Black Market',
    text: 'Take one card from the public Discard for free, ignoring obtain restrictions.',
    playCost: 'stage',
  },
  unethical_research: {
    name: 'Unethical Research',
    text: 'Gain +1 Research Point.',
    playCost: '1',
  },
  monopoly: {
    name: 'Monopoly',
    text: 'Choose a recipe you produce. Opponents must tear those factories down and cannot assign that recipe this Assignment and the next 2.',
    playCost: '1',
  },
  unlicensed_chef: {
    name: 'Unlicensed Chef',
    text: 'Choose a recipe type. You may ignore its Research tier for the rest of the game.',
    playCost: '1',
  },
  labour_exploitation: {
    name: 'Labour Exploitation',
    text: 'Your factory income is doubled this turn.',
    playCost: 'stage',
  },
  veto_power: {
    name: 'Veto Power',
    text: 'Cancel a Scheme as it is played. Does not count as your Scheme play. The cancelled Scheme costs nothing.',
    playCost: '1',
  },
  artificial_shortage: {
    name: 'Artificial Shortage',
    text: 'Choose any ingredient. Each opponent loses 1 copy of that ingredient from Supply. Factories are untouched.',
    playCost: 'stagePlus1',
  },
  price_gouging: {
    name: 'Price Gouging',
    text: 'Choose an ingredient other than Cocoa or Sugar. Recipes using it pay half their printed income (rounded down) for 2 turns.',
    playCost: '2',
  },
  embargo: {
    name: 'Embargo',
    text: 'Choose an ingredient other than Cocoa or Sugar. Recipes using it pay $0 this turn. Factories may stay assigned.',
    playCost: '2',
  },
  overworked: {
    name: 'Overworked',
    text: 'All factory income is doubled this turn, then all factory income is $0 next turn.',
    playCost: '1',
  },
  class_revolution: {
    name: 'Class Revolution',
    text: 'Each player with higher total production than you pays you $3/$6/$9/$12M in Stages 1–4.',
    playCost: 'playersMinus2',
  },
  double_agent: {
    name: 'Double Agent',
    text: 'Choose two other players. Look at their hands and swap one hand card with each of them.',
    playCost: '1',
  },
  secret_project: {
    name: 'Secret Project',
    text: 'Gain +2 Research Points. Your factories pay $0 this turn.',
    playCost: '1',
  },
  defamation_ops: {
    name: 'Defamation Ops',
    text: 'Steal 1/2/3/4 Reputation from the Most Reputable player. Cannot be played if that title is vacant or you hold it.',
    playCost: 'stage',
  },
  hostile_takeover: {
    name: 'Hostile Takeover',
    text: 'You are Most Reputable for this turn and the next 2, overriding the usual title rules.',
    playCost: '1',
  },
  money_laundering: {
    name: 'Money Laundering',
    text: 'Gain $10/$20/$30/$40M from the Bank in Stages 1–4.',
    playCost: 'stage',
  },
}

export const SCHEME_IDS = Object.keys(SCHEME_INFO) as SchemeId[]

export function schemePlayCost(
  id: SchemeId,
  playerCount: number,
  stage: number,
): number {
  const kind = SCHEME_INFO[id].playCost
  if (kind === 'players') return playerCount
  if (kind === 'playersMinus2') return Math.max(1, playerCount - 2)
  if (kind === 'stage') return stage
  if (kind === 'stagePlus1') return stage + 1
  return Number(kind)
}

function ingredient(
  name: string,
  family: IngredientFamily,
  cost: number,
  stage: 0 | 1 | 2 | 3 | 4,
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

function researcher(name: string, cost: number, stage: 1 | 2 | 3 | 4, resP: number): GameCard {
  return { uid: uid('c'), kind: 'researcher', name, cost, stage, resP }
}

function journalist(name: string, cost: number, stage: 1 | 2 | 3 | 4, repP: number): GameCard {
  return { uid: uid('c'), kind: 'journalist', name, cost, stage, repP }
}

function slot(stage: 1 | 2 | 3 | 4): GameCard {
  return { uid: uid('c'), kind: 'slot', name: 'Extra Ingredient Slot', cost: slotFace(stage), stage }
}

function masteryCard(id: MasteryId): GameCard {
  return {
    uid: uid('c'),
    kind: 'mastery',
    name: MASTERY_INFO[id].name,
    cost: CARD_FACE.Masteries,
    stage: 4,
    masteryId: id,
  }
}

export function startingSupply(): GameCard[] {
  return [
    ingredient('Basic Cocoa', 'cocoa', 1, 1),
    ingredient('Sugar', 'sugar', 1, 1),
  ]
}

export function openMarketCard(item: 'cocoa' | 'sugar'): GameCard {
  if (item === 'cocoa') return ingredient('Basic Cocoa', 'cocoa', 1, 0)
  return ingredient('Sugar', 'sugar', 1, 0)
}

type StageSpec = { copies: (n: number) => number; make: () => GameCard }

function stageSpecs(stage: 1 | 2 | 3 | 4): StageSpec[] {
  if (stage === 1) {
    return [
      { copies: (n) => 3 * n, make: () => ingredient('Basic Cocoa', 'cocoa', CARD_FACE['Basic Cocoa'], 1) },
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
      { copies: (n) => n, make: () => ingredient('Basic Cocoa', 'cocoa', CARD_FACE['Basic Cocoa'], 2) },
      { copies: (n) => 2 * n, make: () => ingredient('Sugar', 'sugar', CARD_FACE.Sugar, 2) },
      { copies: (n) => n, make: () => ingredient('Basic Milk', 'milk', CARD_FACE['Basic Milk'], 2) },
      { copies: (n) => n, make: () => slot(2) },
      { copies: (n) => n, make: () => ingredient('Premium Cocoa', 'cocoa', CARD_FACE['Premium Cocoa'], 2, true) },
      { copies: (n) => n, make: () => ingredient('Coffee', 'coffee', CARD_FACE.Coffee, 2) },
      { copies: (n) => n, make: () => researcher('Senior Researcher', CARD_FACE['Senior Researcher'], 2, 2) },
      { copies: (n) => n, make: () => ingredient('Almond', 'almond', CARD_FACE.Almond, 2) },
      { copies: (n) => n, make: () => journalist('Senior Journalist', CARD_FACE['Senior Journalist'], 2, 3) },
    ]
  }
  if (stage === 3) {
    return [
      { copies: (n) => n, make: () => slot(3) },
      { copies: (n) => n, make: () => ingredient('Coffee', 'coffee', CARD_FACE.Coffee, 3) },
      { copies: (n) => n, make: () => ingredient('Almond', 'almond', CARD_FACE.Almond, 3) },
      { copies: (n) => n, make: () => researcher('Master Researcher', CARD_FACE['Master Researcher'], 3, 3) },
      { copies: (n) => n, make: () => ingredient('Wild Berries', 'wild_berries', CARD_FACE['Wild Berries'], 3) },
      { copies: (n) => n, make: () => ingredient('Caramel', 'caramel', CARD_FACE.Caramel, 3) },
      { copies: (n) => n, make: () => ingredient('Premium Milk', 'milk', CARD_FACE['Premium Milk'], 3, true) },
      { copies: (n) => n, make: () => journalist('Master Journalist', CARD_FACE['Master Journalist'], 3, 5) },
      { copies: (n) => n, make: () => ingredient('Strawberry', 'strawberry', CARD_FACE.Strawberry, 3) },
      { copies: (n) => n, make: () => ingredient('Sea Salt', 'sea_salt', CARD_FACE['Sea Salt'], 3) },
    ]
  }
  return [
    { copies: (n) => n, make: () => slot(4) },
    { copies: (n) => 2 * n, make: () => researcher('Master Researcher', CARD_FACE['Master Researcher'], 4, 3) },
    { copies: (n) => n, make: () => ingredient('Wild Berries', 'wild_berries', CARD_FACE['Wild Berries'], 4) },
    { copies: (n) => n, make: () => ingredient('Caramel', 'caramel', CARD_FACE.Caramel, 4) },
    { copies: (n) => n, make: () => ingredient('Royal Honey', 'royal_honey', CARD_FACE['Royal Honey'], 4) },
    { copies: (n) => n, make: () => ingredient('Premium Coffee', 'coffee', CARD_FACE['Premium Coffee'], 4, true) },
    { copies: (n) => n, make: () => ingredient('Premium Almond', 'almond', CARD_FACE['Premium Almond'], 4, true) },
    { copies: (n) => n, make: () => journalist('Master Journalist', CARD_FACE['Master Journalist'], 4, 5) },
  ]
}

export function buildStageDeck(
  stage: 1 | 2 | 3 | 4,
  n: number,
  masteryIds: MasteryId[],
): GameCard[] {
  const cards: GameCard[] = []
  for (const spec of stageSpecs(stage)) {
    const count = spec.copies(n)
    for (let i = 0; i < count; i += 1) cards.push(spec.make())
  }
  if (stage === 4) {
    for (const id of masteryIds.slice(0, n)) cards.push(masteryCard(id))
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
