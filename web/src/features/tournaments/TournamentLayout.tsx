import { useId } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { Page } from '../../shared/Page'
import { QueryError } from '../../shared/QueryError'
import { TournamentNotFoundError } from './api'
import { formatDateRange } from './format'
import styles from './TournamentLayout.module.css'
import { useTournament } from './useTournaments'

/**
 * Wraps every page of one tournament. The tournament comes from the URL (D-21), and the sidebar
 * shows only here (D-19, D-22, NAV-02). Later features add their links to the sidebar and their
 * pages as child routes.
 */
export function TournamentLayout() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const { data, isPending, error, refetch } = useTournament(id)
  const titleId = useId()

  if (isPending) {
    return (
      <Page>
        <output>Loading tournament…</output>
      </Page>
    )
  }
  if (error instanceof TournamentNotFoundError) {
    return (
      <Page>
        <title>Tournament not found · Tournament Director</title>
        <h1>Tournament not found</h1>
        <p>This tournament does not exist. It may have been removed.</p>
        <p>
          <Link to="/tournaments">All tournaments</Link>
        </p>
      </Page>
    )
  }
  if (error) {
    return (
      <Page>
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      </Page>
    )
  }

  return (
    <div className={styles.shell}>
      <nav aria-labelledby={titleId} className={styles.side}>
        <h2 id={titleId} className={styles.name}>
          {data.name}
        </h2>
        <p className={styles.meta}>{formatDateRange(data.startDate, data.endDate)}</p>
        <ul className={styles.items}>
          <li>
            <NavLink to={`/tournaments/${data.id}/divisions`}>Divisions</NavLink>
          </li>
        </ul>
        <p>
          <Link to="/tournaments">Change tournament</Link>
        </p>
      </nav>
      <main className={styles.content}>
        <Outlet context={data} />
      </main>
    </div>
  )
}
