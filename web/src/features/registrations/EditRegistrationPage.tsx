import { Link, useOutletContext, useParams } from 'react-router'
import { DangerZone } from '../../shared/DangerZone'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { useDivisions } from '../divisions/useDivisions'
import { useSquads } from '../squads/useSquads'
import { useSweepers } from '../sweepers/useSweepers'
import type { Tournament } from '../tournaments/types'
import { useTournamentSettings } from '../tournaments/useTournamentSettings'
import { DeleteRegistrationButton } from './DeleteRegistrationButton'
import { RegistrationNotFoundError } from './editApi'
import { EditRegistrationForm } from './EditRegistrationForm'
import { useEditInfo } from './useEditInfo'

/**
 * The desk edits a registration (D-197): division, average, squads, sweepers, super sweeper, and the
 * bowler's details, saved together. Needs `registrations.write`. A complete tournament shows a notice
 * (D-130). The form starts from one fresh read and keeps it until the desk reloads (D-199).
 */
export function EditRegistrationPage() {
  // Stryker disable next-line StringLiteral: the route always has these params; this only satisfies the type.
  const { id = '', registrationId = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const settings = useTournamentSettings(id)
  const info = useEditInfo(id, registrationId)
  const divisions = useDivisions(id)
  const squads = useSquads(id)
  const sweepers = useSweepers(id)
  const listUrl = `/tournaments/${id}/registrations`

  const heading = (
    <>
      <title>{`Edit registration · ${tournament.name} · Tournament Director`}</title>
      <h1>Edit registration</h1>
    </>
  )
  const back = <Link to={listUrl}>Back to registrations</Link>

  if (settings.data?.completed) {
    return (
      <>
        {heading}
        <p>
          <strong>This tournament is complete</strong>
        </p>
        <p>A complete tournament cannot be changed, so you cannot edit a registration.</p>
        {back}
      </>
    )
  }
  if (info.error instanceof RegistrationNotFoundError) {
    return (
      <>
        {heading}
        <p role="alert">Registration not found. It may have been deleted.</p>
        {back}
      </>
    )
  }
  const failed = [settings, info, divisions, squads, sweepers].find((query) => query.error)
  if (failed?.error) {
    return (
      <>
        {heading}
        <QueryError
          error={failed.error}
          onRetry={() => {
            for (const query of [settings, info, divisions, squads, sweepers]) void query.refetch()
          }}
        />
      </>
    )
  }
  if (settings.isPending || !info.data || !divisions.data || !squads.data || !sweepers.data) {
    return (
      <>
        {heading}
        <Loading label="Loading registration…" rows={3} />
      </>
    )
  }
  return (
    <>
      {heading}
      <EditRegistrationForm
        // A fresh read starts the form over, so its changes are measured against what is stored now.
        key={info.dataUpdatedAt}
        tournamentId={id}
        info={info.data}
        divisions={divisions.data}
        squads={squads.data}
        sweepers={sweepers.data}
        onReload={() => {
          void info.refetch()
        }}
      />
      <DangerZone description="Delete this bowler's entire registration. The entries and their lane positions go, and the payment records with them. The bowler record stays. This cannot be undone.">
        <DeleteRegistrationButton
          tournamentId={id}
          registrationId={registrationId}
          bowlerName={`${info.data.bowler.firstName} ${info.data.bowler.lastName}`.trim()}
        >
          Delete registration
        </DeleteRegistrationButton>
      </DangerZone>
    </>
  )
}
