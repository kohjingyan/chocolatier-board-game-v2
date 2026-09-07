export type IngredientFamily =
  | 'cocoa'
  | 'sugar'
  | 'milk'
  | 'matcha'
  | 'coffee'
  | 'almond'
  | 'wild_berries'
  | 'caramel'
  | 'strawberry'
  | 'sea_salt'
  | 'royal_honey'

export type CardKind =
  | 'ingredient'
  | 'researcher'
  | 'journalist'
  | 'slot'
  | 'mastery'

export type SchemeId =
  | 'forced_swap'
  | 'private_viewing'
  | 'patent_lawsuit'
  | 'black_market'
  | 'unethical_research'
  | 'monopoly'
  | 'unlicensed_chef'
  | 'labour_exploitation'
  | 'veto_power'
  | 'artificial_shortage'
  | 'price_gouging'
  | 'embargo'
  | 'overworked'
  | 'class_revolution'
  | 'double_agent'
  | 'secret_project'
  | 'defamation_ops'
  | 'hostile_takeover'
  | 'money_laundering'

export type MasteryId =
  | 'chocolatier'
  | 'exotics_master'
  | 'jack_of_all_trades'
  | 'heritage_line'
  | 'gourmet_pantry'
  | 'experimentalist'
  | 'brand_ambassador'

export type GameCard = {
  uid: string
  kind: CardKind
  name: string
  cost: number
  stage: 1 | 2 | 3 | 4 | 0
  family?: IngredientFamily
  premium?: boolean
  resP?: number
  repP?: number
  masteryId?: MasteryId
}

export type SchemeCard = {
  uid: string
  schemeId: SchemeId
  name: string
}

export type Recipe = {
  id: string
  name: string
  ingredients: IngredientFamily[]
  income: number
  tier: 1 | 2 | 3 | 4
  limit: 'unlimited' | 'n+1' | 'n' | 'n-1' | 'n-2' | 'by-count'
  likelyStage: 1 | 2 | 3 | 4
}

export type Factory = {
  id: string
  extraSlots: number
  ingredients: GameCard[]
  recipeId: string | null
}

export type Player = {
  id: string
  name: string
  isBot: boolean
  cash: number
  hand: GameCard[]
  schemes: SchemeCard[]
  supply: GameCard[]
  factories: Factory[]
  extraSlotPool: number
  boughtRepSlot: boolean
  boughtRepSlotL2: boolean
  boughtExtraFactory: boolean
  assignedResP: number
  assignedRepP: number
  earnedRecipeRep: number
  reliefResP: number
  reliefRepP: number
  reliefPenalty: number
  spentRep: number
  completedRecipes: string[]
  mastery: MasteryId | null
  masteryChoices: { t1?: string; t2?: string; t3?: string }
  unlicensedRecipes: string[]
  schemePlayedThisRound: boolean
  lastIncome: number
  lastBreakdown: IncomeBreakdown
}

export type IncomeBreakdown = {
  factories: number
  research: number
  reputation: number
  masteries: number
  total: number
}

export type Effect =
  | { kind: 'monopoly'; recipeId: string; ownerId: string; remaining: number }
  | { kind: 'price_gouging'; family: IngredientFamily; remaining: number }
  | { kind: 'embargo'; family: IngredientFamily; remaining: number }
  | { kind: 'overworked_double' }
  | { kind: 'overworked_disable' }
  | { kind: 'labour'; playerId: string }
  | { kind: 'secret_project'; playerId: string; remaining: number }
  | { kind: 'hostile_takeover'; playerId: string; remaining: number }

export type LogEntry = {
  id: number
  text: string
}

export type Phase =
  | 'setup'
  | 'curtain'
  | 'bid'
  | 'bid_reveal'
  | 'bid_tie'
  | 'dice_tie'
  | 'contribute'
  | 'private_viewing'
  | 'purchase'
  | 'scheme'
  | 'assignment'
  | 'income'
  | 'relief'
  | 'relief_dice'
  | 'game_over'

export type ReliefKind = 'res' | 'rep' | 'cash' | 'discard'

export type PendingScheme = {
  playerId: string
  cardUid: string
  schemeId: SchemeId
  name: string
  playCost: number
  targets: SchemeTargets
}

export type SchemeTargets = {
  opponentId?: string
  opponentId2?: string
  ownCardUid?: string
  ownCardUid2?: string
  theirCardUid?: string
  theirCardUid2?: string
  recipeId?: string
  family?: IngredientFamily
  discardUid?: string
  masteryKeep?: 'old' | 'new'
  t1?: string
  t2?: string
  t3?: string
}

export type GameState = {
  playerCount: number
  players: Player[]
  phase: Phase
  stage: 1 | 2 | 3 | 4
  round: number
  turnOrder: string[]
  actorIndex: number
  curtainPlayerId: string | null
  resumePhase: Phase | null
  bids: Record<string, number>
  tieIds: string[]
  dice: Record<string, number>
  pool: GameCard[]
  contributed: Record<string, string>
  publicDiscard: GameCard[]
  leftoverDiscard: GameCard[]
  schemeDeck: SchemeCard[]
  schemeDiscard: SchemeCard[]
  openCocoa: number
  openSugar: number
  effects: Effect[]
  pendingScheme: PendingScheme | null
  vetoIndex: number
  pvResolved: boolean
  firstIntroducedBy: Record<string, string>
  mostReputableId: string | null
  bidRound: 'main' | 'tie'
  dicePrefix: string[]
  diceSuffix: string[]
  diceBlock: string[]
  stageDeck: GameCard[]
  marketMode: 'contribute' | 'direct'
  incomeOverrides: Record<string, number>
  costOverrides: Record<string, number>
  log: LogEntry[]
  logSeq: number
  incomePreview: Record<string, IncomeBreakdown> | null
  seed: number
  playMode: 'hotseat' | 'online'
  schemeDraft: SchemeCard[] | null
  reliefRanks: Record<string, number>
  reliefMax: Record<string, number>
  reliefPicks: Record<string, ReliefKind[]>
  reliefQueue: string[]
  reliefIndex: number
}

export type SetupConfig = {
  seats: { name: string; isBot: boolean }[]
  marketMode?: 'contribute' | 'direct'
  playMode?: 'hotseat' | 'online'
}

export type Action =
  | { type: 'START'; config: SetupConfig }
  | { type: 'ACK_CURTAIN' }
  | { type: 'BID'; amount: number }
  | { type: 'ACK_BIDS' }
  | { type: 'ROLL_DICE' }
  | { type: 'CONTRIBUTE'; cardUid: string }
  | { type: 'PASS_PRIVATE_VIEWING' }
  | { type: 'PLAY_PRIVATE_VIEWING'; cardUid: string }
  | { type: 'BUY_POOL'; cardUid: string }
  | { type: 'DISCARD_POOL'; cardUid: string }
  | { type: 'BUY_OPEN'; item: 'cocoa' | 'sugar' }
  | { type: 'FINISH_PURCHASE' }
  | { type: 'DRAW_SCHEME' }
  | { type: 'KEEP_SCHEME'; cardUid: string }
  | { type: 'PLAY_SCHEME'; cardUid: string; targets: SchemeTargets }
  | { type: 'CHOOSE_RELIEF'; kind: ReliefKind; discardUid?: string }
  | { type: 'SKIP_RELIEF' }
  | { type: 'SKIP_SCHEME' }
  | { type: 'VETO'; cardUid: string }
  | { type: 'DECLINE_VETO' }
  | { type: 'ASSIGN_RECIPE'; factoryId: string; cardUids: string[] }
  | { type: 'TEAR_DOWN'; factoryId: string }
  | { type: 'ASSIGN_SPECIALIST'; cardUid: string }
  | { type: 'MOVE_SLOTS'; factoryId: string; delta: number }
  | { type: 'BUY_EXTRA_FACTORY' }
  | { type: 'BUY_EXTRA_SLOT'; track: 1 | 2 }
  | { type: 'SET_MASTERY_CHOICES'; choices: { t1?: string; t2?: string; t3?: string } }
  | { type: 'FINISH_ASSIGNMENT' }
  | { type: 'ACK_INCOME' }
  | { type: 'SET_RECIPE_INCOME'; recipeId: string; income: number }
  | { type: 'SET_CARD_COST'; cardName: string; cost: number }
  | { type: 'NEW_GAME' }
