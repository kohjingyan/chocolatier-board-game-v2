import { partyHost, roomUrl } from './net/client'
import type { ClientMessage, RoomSnapshot } from './net/protocol'

export function OnlineEntry({
  onCreate,
  onJoin,
  joinCode,
  onJoinCode,
}: {
  onCreate: () => void
  onJoin: () => void
  joinCode: string
  onJoinCode: (code: string) => void
}) {
  const host = partyHost()
  return (
    <div className="setup panel" style={{ marginTop: '1rem' }}>
      <h2>Live room</h2>
      <p className="tiny">
        Create a room and send the code or link. Friends join on their own devices. Empty human seats
        become bots when you start.
      </p>
      {!host && (
        <p className="tiny warn">
          Online rooms need a room server. Locally run <code>npm run party</code> (port 1999). For
          a public Vercel link, deploy PartyKit with Node 18+: <code>npx partykit login</code> then{' '}
          <code>npm run party:deploy</code>, and set Vercel env <code>VITE_PARTYKIT_HOST</code> to
          the printed <code>*.partykit.dev</code> host (no <code>https://</code>).
        </p>
      )}
      <div className="row">
        <button type="button" disabled={!host} onClick={onCreate}>
          Create room
        </button>
      </div>
      <div className="row" style={{ marginTop: '0.7rem' }}>
        <input
          value={joinCode}
          maxLength={6}
          placeholder="Room code"
          onChange={(e) => onJoinCode(e.target.value.toUpperCase())}
        />
        <button type="button" disabled={!host || joinCode.length < 6} onClick={onJoin}>
          Join room
        </button>
      </div>
    </div>
  )
}

export function RoomLobby({
  code,
  room,
  you,
  send,
  error,
  onLeave,
}: {
  code: string
  room: RoomSnapshot
  you: string
  send: (msg: ClientMessage) => void
  error: string
  onLeave: () => void
}) {
  const isHost = Boolean(you) && you === room.hostId
  const mySeat = room.seats.find((s) => s.claimedBy === you)
  const share = roomUrl(code)
  return (
    <div className="setup panel">
      <div className="brand">Live room</div>
      <h1>{code}</h1>
      <p className="tiny">
        Share this link: <a href={share}>{share}</a>
      </p>
      <div className="row">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (navigator.clipboard?.writeText) navigator.clipboard.writeText(share)
          }}
        >
          Copy link
        </button>
        <button type="button" className="secondary" onClick={onLeave}>
          Leave
        </button>
      </div>
      <label style={{ marginTop: '0.8rem' }}>
        Players
        <select
          value={room.seats.length}
          disabled={!isHost}
          onChange={(e) => send({ type: 'setCount', count: Number(e.target.value) })}
        >
          {[3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="tiny" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={room.marketMode === 'direct'}
          disabled={!isHost}
          style={{ width: 'auto' }}
          onChange={(e) => send({ type: 'setMarketMode', mode: e.target.checked ? 'direct' : 'contribute' })}
        />
        Direct draw (skip Market Composition)
      </label>
      {room.seats.map((seat) => (
        <div className="seat" key={seat.id}>
          <input
            value={seat.name}
            disabled={!isHost && mySeat?.id !== seat.id}
            onChange={(e) => {
              if (isHost) send({ type: 'setSeat', seatId: seat.id, name: e.target.value, isBot: seat.isBot })
              else if (mySeat?.id === seat.id) send({ type: 'claimSeat', seatId: seat.id, name: e.target.value })
            }}
          />
          {isHost ? (
            <select
              value={seat.isBot ? 'bot' : 'human'}
              onChange={(e) =>
                send({ type: 'setSeat', seatId: seat.id, name: seat.name, isBot: e.target.value === 'bot' })
              }
            >
              <option value="human">Human</option>
              <option value="bot">Bot</option>
            </select>
          ) : (
            <button
              type="button"
              className="secondary"
              disabled={seat.isBot || Boolean(seat.claimedBy && seat.claimedBy !== you)}
              onClick={() => {
                if (seat.claimedBy === you) send({ type: 'releaseSeat', seatId: seat.id })
                else send({ type: 'claimSeat', seatId: seat.id, name: seat.name })
              }}
            >
              {seat.claimedBy === you ? 'Leave seat' : seat.claimedBy ? 'Taken' : seat.isBot ? 'Bot' : 'Sit here'}
            </button>
          )}
        </div>
      ))}
      {error && <p className="tiny warn">{error}</p>}
      {!you && <p className="tiny warn">Connecting to the room…</p>}
      <div className="row" style={{ marginTop: '1rem' }}>
        <button type="button" disabled={!isHost} onClick={() => send({ type: 'start' })}>
          {isHost ? 'Start the game' : you ? 'Waiting for the host' : 'Connecting…'}
        </button>
      </div>
      <p className="tiny">
        {isHost
          ? 'You are the host. Edit names and Human/Bot, then start.'
          : you
            ? 'You can claim an open human seat.'
            : 'Waiting to join the room.'}{' '}
        Unclaimed human seats become bots.
      </p>
    </div>
  )
}
