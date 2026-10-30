import { useId } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatSessionDate } from '../../shared/sessionFormat'
import { formatPair } from '../lanes/format'
import type { Tournament } from '../tournaments/types'
import { countListed, formatNoLane } from './format'
import { ScoreTable } from './ScoreTable'
import styles from './ScoresPage.module.css'
import type { ScorePage, SessionKind } from './types'
import { useScores } from './useScores'

function OtherPositions({ page }: Readonly<{ page: ScorePage }>) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={styles.other}>
      <h2 id={titleId} className={styles.otherTitle}>
        Other positions ({page.other.length})
      </h2>
      <p className={styles.note}>
        These positions are not on a pair of this {page.session.kind}. Check them against its lanes.
      </p>
      <ScoreTable
        bowlers={page.other}
        games={page.session.games}
        label="Scores for other positions"
      />
    </section>
  )
}

/**
 * The scores of one squad or sweeper, grouped by lane pair (SCR-13, SCR-17, D-69). Read only in
 * both states: entry is a later slice. It asks again every 15 seconds (D-72), and a failed refresh
 * leaves the last scores on screen.
 */
export function ScoresPage({ kind }: Readonly<{ kind: SessionKind }>) {
  // Stryker disable next-line StringLiteral: the route always has these params; this only satisfies the type.
  const { id = '', sessionId = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, error, refetch } = useScores(kind, id, sessionId)

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
    return <Loading label="Loading scores…" rows={4} />
  }

  const { session } = data
  const listed = countListed(data)
  const lanesPath = `/tournaments/${id}/${kind}s/${sessionId}/lanes`

  let body
  if (listed === 0 && data.noLane === 0) {
    body = <p>No bowlers have entered this {kind} yet.</p>
  } else if (listed === 0) {
    body = <p>No one has a lane yet. Assign lanes first.</p>
  } else {
    body = (
      <>
        <ul className={styles.pairs}>
          {data.pairs.map((pair) => (
            <li key={pair.firstLane} className={styles.pair}>
              <h2 className={styles.pairTitle}>{formatPair(pair)}</h2>
              <ScoreTable
                bowlers={pair.bowlers}
                games={session.games}
                label={`Scores for ${formatPair(pair).toLowerCase()}`}
              />
            </li>
          ))}
        </ul>
        {data.other.length > 0 && <OtherPositions page={data} />}
      </>
    )
  }

  return (
    <>
      <title>{`Scores · ${formatSessionDate(session.date)} · ${tournament.name} · Tournament Director`}</title>
      {session.complete && (
        <p className={styles.note}>This {kind} is complete. Scores cannot change.</p>
      )}
      {data.noLane > 0 && (
        <p className={styles.note}>
          {formatNoLane(data.noLane)} <Link to={lanesPath}>Assign lanes</Link>
        </p>
      )}
      {body}
    </>
  )
}
