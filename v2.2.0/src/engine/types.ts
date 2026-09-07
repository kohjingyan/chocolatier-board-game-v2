export type IngredientFamily =
  | 'cocoa'
  | 'sugar'
  | 'milk'
  | 'matcha'
  | 'coffee'
  | 'almond'
  | 'wild_berries'
  | 'caramel'
  | 'sea_salt'
  | 'royal_honey'

export type CardKind =
  | 'ingredient'
  | 'researcher'
  | 'journalist'
  | 'slot'
  | 'mastery'

export type SchemeId =
  | 'artificial_shortage'
  | 'black_market'
  | 'defamation_ops'
  | 'double_agent'
  | 'embargo'
  | 'embezzlement'
  | 'forced_swap'
  | 'hazardous_warehousing'
  | 'hostile_takeover'
  | 'labour_exploitation'
  | 'money_laundering'
  | 'press_leak'
  | 'price_gouging'
  | 'private_viewing'
  | 'secret_project'
  | 'synthetic_ingredient'
  | 'unethical_research'
  | 'unlicensed_chef'
  | 'veto_power'

export type MasteryId =
  | 'chocolatier'
  | 'exotics_master'
  | 'heritage_line'
  | 'masterchef'
  | 'experimentalist'
  | 'brand_ambassador'
  | 'tycoon'

export type GameCard = {
  uid: string
  kind: CardKind
  name: string
  cost: number
  stage: 1 | 2 | 3 | 0
  family?: IngredientFamily
  premium?: boolean
  resP?: number
  repP?: number
  masteryId?: MasteryId
  hazardous?: boolean
  synthetic?: boolean
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
  requiredRes: 0 | 1 | 2 | 3
  limit: 'unlimited' | 'n+1' | 'n' | 'n-1' | 'n-2' | number
  likelyStage: 1 | 2 | 3
}

export type Factory = {
  id: string
  extraSlots: number
  hazardousSlots: number
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
  extraHazardPool: number
  boughtRepSlot: boolean
  boughtRepSlotL2: boolean
  boughtExtraFactory: boolean
  boughtJuniorResearcher: boolean
  boughtSeniorResearcherL2: boolean
  boughtSeniorResearcherL3: boolean
  assignedResP: number
  assignedRepP: number
  earnedRecipeRep: number
  reliefResP: number
  reliefRepP: number
  reliefPenalty: number
  spentRep: number
  completedRecipes: string[]
  mastery: MasteryId | null
  unlicensedRecipes: string[]
  schemePlayedThisRound: boolean
  lastIncome: number
  lastFactoryIncome: number
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
  | { kind: 'price_gouging'; family: IngredientFamily; remaining: number }
  | { kind: 'embargo'; family: IngredientFamily; remaining: number }
  | { kind: 'labour'; playerId: string; remaining: number }
  | { kind: 'secret_project'; playerId: string; remaining: number }
  | { kind: 'hostile_takeover'; playerId: string; remaining: number }
  | { kind: 'defamation_idle'; playerId: string; remaining: number }

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
  awaitingTargets: boolean
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
  factoryId?: string
}

export type GameState = {
  playerCount: number
  players: Player[]
  phase: Phase
  stage: 1 | 2 | 3
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
  masteryMarket: GameCard[]
  effects: Effect[]
  pendingScheme: PendingScheme | null
  vetoIndex: number
  pvQueue: string[]
  pvPassed: string[]
  firstIntroducedBy: Record<string, string>
  mostReputableId: string | null
  bidRound: 'main' | 'tie'
  dicePrefix: string[]
  diceSuffix: string[]
  diceBlock: string[]
  stageDeck: GameCard[]
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
  assignmentDone: Record<string, boolean>
}

export type SetupConfig = {
  seats: { name: string; isBot: boolean }[]
  playMode?: 'hotseat' | 'online'
}

type ActionBody =
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
  | { type: 'BUY_MASTERY'; cardUid: string }
  | { type: 'FINISH_PURCHASE' }
  | { type: 'DRAW_SCHEME' }
  | { type: 'KEEP_SCHEME'; cardUid: string }
  | { type: 'PLAY_SCHEME'; cardUid: string; targets?: SchemeTargets }
  | { type: 'CONFIRM_SCHEME_TARGETS'; targets: SchemeTargets }
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
  | { type: 'BUY_TRACK_RESEARCHER'; kind: 'junior' | 'senior_l2' | 'senior_l3' }
  | { type: 'FINISH_ASSIGNMENT' }
  | { type: 'ACK_INCOME' }
  | { type: 'SET_RECIPE_INCOME'; recipeId: string; income: number }
  | { type: 'SET_CARD_COST'; cardName: string; cost: number }
  | { type: 'NEW_GAME' }

export type Action = ActionBody & { actorId?: string }
