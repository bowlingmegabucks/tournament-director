import { useId, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { Page } from '../../shared/Page'
import { QueryError } from '../../shared/QueryError'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
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
  const menuId = useId()
  // Phone only: the menu starts closed so the page is the first thing on screen. CSS ignores it on wider screens.
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => {
    setMenuOpen(false)
  }

  if (isPending) {
    return (
      <Page>
        <Loading label="Loading tournament…" />
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
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => {
            setMenuOpen((open) => !open)
          }}
        >
          Tournament menu
        </button>
        <div id={menuId} className={menuOpen ? styles.menu : `${styles.menu} ${styles.closed}`}>
          <ul className={styles.items}>
            <li>
              <NavLink onClick={closeMenu} to={`/tournaments/${data.id}/divisions`}>
                Divisions
              </NavLink>
            </li>
            <li>
              <NavLink onClick={closeMenu} to={`/tournaments/${data.id}/squads`}>
                Squads
              </NavLink>
            </li>
            <li>
              <NavLink onClick={closeMenu} to={`/tournaments/${data.id}/sweepers`}>
                Sweepers
              </NavLink>
            </li>
            <li>
              <NavLink onClick={closeMenu} to={`/tournaments/${data.id}/registrations`}>
                Registrations
              </NavLink>
            </li>
            <li>
              <NavLink onClick={closeMenu} to={`/tournaments/${data.id}/at-large`}>
                At-large
              </NavLink>
            </li>
            <li>
              <NavLink onClick={closeMenu} to={`/tournaments/${data.id}/seeding`}>
                Seeding
              </NavLink>
            </li>
          </ul>
          <p>
            <Link onClick={closeMenu} to="/tournaments">
              Change tournament
            </Link>
          </p>
        </div>
      </nav>
      <main className={styles.content}>
        <Outlet context={data} />
      </main>
    </div>
  )
}
