import { Link } from 'react-router'
import { Can } from '../auth/Can'
import { useTournamentSettings } from '../tournaments/useTournamentSettings'
import styles from './AddRegistration.module.css'

interface AddRegistrationLinkProps {
  tournamentId: string
  /** Opens the page with this squad or sweeper checked and locked (REG-22, D-164). */
  session?: { kind: 'squad' | 'sweeper'; id: string }
  children: string
}

function Inner({ tournamentId, session, children }: Readonly<AddRegistrationLinkProps>) {
  const settings = useTournamentSettings(tournamentId)
  // Not while the settings load, and not on a complete tournament (D-130). If the read fails the
  // link shows anyway: the page and the API refuse a complete tournament.
  if (settings.isPending || settings.data?.completed === true) return null
  const query = session ? `?${session.kind}=${encodeURIComponent(session.id)}` : ''
  return (
    <Link className={styles.addLink} to={`/tournaments/${tournamentId}/registrations/new${query}`}>
      {children}
    </Link>
  )
}

/** The link to the add-registration page, for a user who may add (`registrations.write`, D-157). */
export function AddRegistrationLink(props: Readonly<AddRegistrationLinkProps>) {
  return (
    <Can permission="registrations.write">
      <Inner {...props} />
    </Can>
  )
}
