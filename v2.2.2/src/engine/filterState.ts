import type { GameCard, GameState, Player } from './types'

export function isHiddenCard(card: GameCard): boolean {
  return card.name === 'Hidden card' || card.uid.startsWith('hidden-')
}

export function canRevealHands(state: GameState, viewerId: string): boolean {
  const viewer = state.players.find((p) => p.id === viewerId)
  return Boolean(
    (state.phase === 'scheme' && viewer?.schemes.some((c) => c.schemeId === 'double_agent')) ||
      (state.pendingScheme?.schemeId === 'double_agent' &&
        state.pendingScheme.awaitingTargets &&
        state.pendingScheme.playerId === viewerId),
  )
}

export function canRevealSchemes(state: GameState, viewerId: string, ownerId: string): boolean {
  if (viewerId === ownerId) return true
  return Boolean(
    state.pendingScheme?.schemeId === 'press_leak' &&
      state.pendingScheme.awaitingTargets &&
      state.pendingScheme.playerId === viewerId,
  )
}

export function filterStateForPlayer(state: GameState, playerId: string | null): GameState {
  const revealHands = playerId ? canRevealHands(state, playerId) : false
  return {
    ...state,
    players: state.players.map((p) => redactPlayer(p, playerId, revealHands, state)),
    stageDeck: state.stageDeck.map((c) => ({ ...c, name: 'Facedown' })),
    schemeDeck: state.schemeDeck.map((c) => ({ ...c, name: 'Scheme' })),
  }
}

function redactPlayer(
  player: Player,
  viewerId: string | null,
  revealHands: boolean,
  state: GameState,
): Player {
  if (viewerId && player.id === viewerId) return player
  const revealSchemes = viewerId ? canRevealSchemes(state, viewerId, player.id) : false
  return {
    ...player,
    hand: revealHands
      ? player.hand
      : player.hand.map((c, i) => ({
          uid: `hidden-${player.id}-h${i}`,
          kind: c.kind,
          name: 'Hidden card',
          cost: 0,
          stage: c.stage,
        })),
    schemes: revealSchemes ? player.schemes : [],
  }
}
