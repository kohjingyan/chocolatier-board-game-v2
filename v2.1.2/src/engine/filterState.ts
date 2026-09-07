import type { GameState, Player } from './types'

export function filterStateForPlayer(state: GameState, playerId: string | null): GameState {
  if (!playerId || state.playMode !== 'online') return state
  const viewer = state.players.find((p) => p.id === playerId)
  const revealHands = Boolean(
    state.phase === 'scheme' && viewer?.schemes.some((c) => c.schemeId === 'double_agent'),
  )
  return {
    ...state,
    players: state.players.map((p) => redactPlayer(p, playerId, revealHands)),
    stageDeck: state.stageDeck.map((c) => ({ ...c, name: 'Facedown' })),
    schemeDeck: state.schemeDeck.map((c) => ({ ...c, name: 'Scheme' })),
  }
}

function redactPlayer(player: Player, viewerId: string, revealHands: boolean): Player {
  if (player.id === viewerId) return player
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
    schemes: [],
  }
}
