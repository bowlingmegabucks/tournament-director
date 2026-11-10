import { Navigate, useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatSessionDate } from '../../shared/sessionFormat'
import type { Tournament } from '../tournaments/types'
import { useTournamentOpen } from '../tournaments/useTournamentOpen'
import { firstOpenGame } from './entryLogic'
import { entryPath } from './entryPaths'
import styles from './EntryPage.module.css'
import { GameBoard } from './GameBoard'
import { PairSheet } from './PairSheet'
import type { SessionKind } from './types'
import { useEntryEvents } from './useEntryEvents'
import { useGames } from './useGames'
import { useLaneRange } from './useLaneRange'

/** A whole number from 1 in an address, else `undefined`. */
function wholeNumber(text: string | undefined): number | undefined {
  if (text === undefined || !/^\d{1,3}$/.test(text)) return undefined
  const number = Number(text)
  return number >= 1 ? number : undefined
}

/**
 * Score entry for one squad or sweeper (SCR-21, D-230): the game board and, once a pair is picked,
 * its sheet. `/scores/entry` goes to the first game that misses a score; `/entry/2` is the board
 * of game 2; `/entry/2/13` is the sheet of lanes 13-14 in game 2. From a tablet up both show side
 * by side; on a phone one shows at a time. It needs `scores.write` (the route asks), reads the
 * games over the API, and refreshes from the public stream (SCR-20, D-232). A complete session or
 * tournament is read only (D-231).
 */
export function EntryPage({ kind }: Readonly<{ kind: SessionKind }>) {
  // Stryker disable next-line StringLiteral: the route always has these params; this only satisfies the type.
  const { id = '', sessionId = '', game: gameText, firstLane: laneText } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, error, refetch } = useGames(kind, id, sessionId)
  const tournamentOpen = useTournamentOpen(id)
  const [range, setRange] = useLaneRange(sessionId)
  const readOnly = (data?.session.complete ?? false) || !tournamentOpen
  const state = useEntryEvents(kind, id, sessionId, data !== undefined && !readOnly)

  if (!data) {
    if (error) {
      return (
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )
    }
    return <Loading label="Loading the games…" rows={3} />
  }

  const game = wholeNumber(gameText)
  const entry =
    game === undefined ? undefined : data.games.find((candidate) => candidate.game === game)
  // No game, or one the session does not have: start on the first game that misses a score.
  if (game === undefined || !entry) {
    if (data.games.length === 0) return <p>This {kind} has no games.</p>
    return <Navigate to={entryPath(kind, id, sessionId, firstOpenGame(data))} replace />
  }

  const firstLane = wholeNumber(laneText)
  const pairs = entry.pairs
  const index = pairs.findIndex((pair) => pair.firstLane === firstLane)
  const detail = firstLane !== undefined

  return (
    <>
      <title>{`Enter scores · ${formatSessionDate(data.session.date)} · ${tournament.name} · Tournament Director`}</title>
      <div className={styles.panes} data-detail={detail}>
        <div className={styles.board}>
          <GameBoard
            kind={kind}
            tournamentId={id}
            sessionId={sessionId}
            view={data}
            game={game}
            active={firstLane}
            state={state}
            readOnly={readOnly}
            range={range}
            onRange={setRange}
          />
        </div>
        <div className={styles.detail}>
          {detail ? (
            <PairSheet
              key={`${game}:${firstLane}`}
              kind={kind}
              tournamentId={id}
              sessionId={sessionId}
              game={entry}
              pair={pairs[index]}
              firstLane={firstLane}
              previous={index > 0 ? pairs[index - 1] : undefined}
              next={index >= 0 ? pairs[index + 1] : undefined}
              readOnly={readOnly}
            />
          ) : (
            <p className={styles.pick}>Pick a pair to enter its scores.</p>
          )}
        </div>
      </div>
    </>
  )
}
