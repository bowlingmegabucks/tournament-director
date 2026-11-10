import { useId, useState } from 'react'
import { Link } from 'react-router'
import { Can } from '../auth/Can'
import { LiveStatus } from '../../shared/LiveStatus'
import type { LiveState } from '../../shared/useEventStream'
import { formatPair } from '../lanes/format'
import { digitsOnly, findBowlers, pairsInRange, type LaneRange } from './entryLogic'
import { entryPath } from './entryPaths'
import styles from './GameBoard.module.css'
import type { GamePair, GamesView } from './gamesTypes'
import type { SessionKind } from './types'
import { useSaveSkip } from '../skip/useSaveSkip'

interface GameBoardProps {
  kind: SessionKind
  tournamentId: string
  sessionId: string
  view: GamesView
  /** The game picked, 1 to the session's games. */
  game: number
  /** The first lane of the pair whose sheet is open, if one is. */
  active: number | undefined
  state: LiveState
  readOnly: boolean
  range: LaneRange
  onRange: (next: LaneRange) => void
}

const inCount = (pair: GamePair) => pair.bowlers.filter((bowler) => bowler.score !== null).length

/** "4 of 4 in" with a mark that says it in a symbol too, never color alone (SCR-21). */
function Progress({ pair }: Readonly<{ pair: GamePair }>) {
  const done = inCount(pair)
  const text = `${done} of ${pair.bowlers.length} in`
  if (done === pair.bowlers.length) return <span className={styles.ok}>✓ {text}</span>
  return (
    <span className={done > 0 ? styles.part : styles.wait}>
      {done > 0 ? '◐' : '○'} {text}
    </span>
  )
}

/**
 * The game board of score entry (SCR-21, D-230): pick a game, then a pair of lanes as it is bowled
 * in that game. Bowlers move pairs between games, so every game lists its own pairs. It also holds
 * the session's skip (D-235), Find a bowler (the way to reach one who is not where the cross says,
 * D-236), and the keeper's lane range, which only hides pairs on this device (D-230).
 */
export function GameBoard({
  kind,
  tournamentId,
  sessionId,
  view,
  game,
  active,
  state,
  readOnly,
  range,
  onRange,
}: Readonly<GameBoardProps>) {
  const findId = useId()
  const [query, setQuery] = useState('')
  const saveSkip = useSaveSkip(kind, tournamentId, sessionId)
  const skip = saveSkip.isPending ? saveSkip.variables : view.skip
  const current = view.games.find((entry) => entry.game === game)
  const pairs = current?.pairs ?? []
  const shown = pairsInRange(pairs, range)
  const hits = current ? findBowlers(current, query) : []
  const ranged = range.from !== '' || range.to !== ''
  const anyBowlers = view.games.some((entry) => entry.pairs.length > 0)
  const lanesPath = `/tournaments/${tournamentId}/${kind}s/${sessionId}/lanes`

  return (
    <section className={styles.board} aria-label="Game board">
      {readOnly ? (
        <p className={styles.note}>This {kind} is complete. Scores cannot change.</p>
      ) : (
        <LiveStatus state={state} updated={undefined} />
      )}

      <nav className={styles.games} aria-label="Game">
        {view.games.map((entry) => (
          <Link
            key={entry.game}
            to={entryPath(kind, tournamentId, sessionId, entry.game)}
            className={styles.gameLink}
            aria-current={entry.game === game ? 'true' : undefined}
          >
            <strong>Game {entry.game}</strong>
            <small>
              {entry.entered} of {entry.total}
              {entry.total > 0 && entry.entered === entry.total ? ' ✓' : ''}
            </small>
          </Link>
        ))}
      </nav>

      <fieldset className={styles.skip} disabled={readOnly || saveSkip.isPending}>
        <legend className={styles.skipLegend}>Skip</legend>
        <label className={styles.skipOption}>
          <input
            type="radio"
            name="entry-skip"
            checked={skip === 'staggered'}
            onChange={() => {
              saveSkip.mutate('staggered')
            }}
          />
          <span>Staggered</span>
        </label>
        <label className={styles.skipOption}>
          <input
            type="radio"
            name="entry-skip"
            checked={skip === 'same'}
            onChange={() => {
              saveSkip.mutate('same')
            }}
          />
          <span>Same</span>
        </label>
      </fieldset>
      {saveSkip.isError && (
        <p role="alert" className={styles.problem}>
          {saveSkip.error.message}
        </p>
      )}

      {!anyBowlers ? (
        <div>
          <p>No one has a lane yet. Assign lanes first.</p>
          <Can permission="lanes.read">
            <Link to={lanesPath}>Go to Lane assignments</Link>
          </Can>
          {view.withoutLane > 0 && (
            <p className={styles.muted}>
              {view.withoutLane} {view.withoutLane === 1 ? 'bowler has' : 'bowlers have'} no lane.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className={styles.search}>
            <label htmlFor={findId}>Find a bowler</label>
            <input
              id={findId}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
              }}
            />
          </div>
          {query.trim() !== '' &&
            (hits.length === 0 ? (
              <p className={styles.muted}>No bowler matches that.</p>
            ) : (
              <ul className={styles.found} aria-label="Bowlers found">
                {hits.map((hit) => (
                  <li key={hit.registrationId}>
                    <Link to={entryPath(kind, tournamentId, sessionId, game, hit.firstLane)}>
                      <span>{hit.name}</span>
                      <span className={styles.muted}>
                        Game {game} · {hit.lane}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}

          <form
            className={styles.range}
            aria-label="Lanes you work"
            onSubmit={(event) => {
              event.preventDefault()
            }}
          >
            {(['from', 'to'] as const).map((end) => (
              <label key={end}>
                {end === 'from' ? 'From lane' : 'To lane'}
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  autoComplete="off"
                  value={range[end]}
                  onChange={(event) => {
                    onRange({ ...range, [end]: digitsOnly(event.target.value) })
                  }}
                />
              </label>
            ))}
            {ranged && (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  onRange({ from: '', to: '' })
                }}
              >
                Show all
              </button>
            )}
          </form>

          {shown.length === 0 ? (
            <p>
              No pair with bowlers in lanes {range.from || 'any'} to {range.to || 'any'} in game{' '}
              {game}.
            </p>
          ) : (
            <ul className={styles.tiles} aria-label={`Pairs for game ${game}`}>
              {shown.map((pair) => (
                <li key={pair.firstLane}>
                  <Link
                    to={entryPath(kind, tournamentId, sessionId, game, pair.firstLane)}
                    className={styles.tile}
                    aria-current={pair.firstLane === active ? 'page' : undefined}
                    ref={(node) => {
                      if (pair.firstLane === active) node?.scrollIntoView?.({ block: 'nearest' })
                    }}
                  >
                    <strong>{formatPair(pair)}</strong>
                    <Progress pair={pair} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {view.withoutLane > 0 && (
            <p className={styles.muted}>
              {view.withoutLane} {view.withoutLane === 1 ? 'bowler has' : 'bowlers have'} no lane
              and cannot be entered here.
            </p>
          )}
        </>
      )}
    </section>
  )
}
