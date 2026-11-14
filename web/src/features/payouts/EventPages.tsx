import { Link, useParams } from 'react-router'
import { EventPayouts } from './EventPayouts'

/** The Payouts tab of a squad or sweeper (PAY-02, PAY-03, D-276). Its heading is the portal's. */
export function SessionPayoutsTab({ kind }: Readonly<{ kind: 'squad' | 'sweeper' }>) {
  // Stryker disable next-line StringLiteral: the route always has these params; this only satisfies the type.
  const { id = '', sessionId = '' } = useParams()
  return <EventPayouts source={kind} tournamentId={id} eventId={sessionId} />
}

/** `/tournaments/:id/super-sweeper/payouts` (PAY-04, D-276). */
export function SuperSweeperPayoutsPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  return (
    <>
      <p>
        <Link to={`/tournaments/${id}/sweepers`}>Sweepers</Link>
      </p>
      <EventPayouts source="superSweeper" tournamentId={id} eventId={id} />
    </>
  )
}

/** `/tournaments/:id/seeding/:divisionId/payouts`: the finals payouts of one division (PAY-05, D-276). */
export function FinalsPayoutsPage() {
  // Stryker disable next-line StringLiteral: the route always has these params; this only satisfies the type.
  const { id = '', divisionId = '' } = useParams()
  return (
    <>
      <p>
        <Link to={`/tournaments/${id}/seeding`}>Seeding</Link>
      </p>
      <EventPayouts source="finals" tournamentId={id} eventId={divisionId} />
    </>
  )
}
