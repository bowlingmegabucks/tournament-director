import { Link } from 'react-router'
import { useCan } from '../auth/useCan'
import { FinalsDivisionPage } from './FinalsDivisionPage'
import { PrintSeeding } from './PrintFinals'
import { SeedingBody } from './SeedingTable'
import { UnofficialNotice } from './UnofficialNotice'
import { useSeeding } from './useResults'

type Data = NonNullable<ReturnType<typeof useSeeding>['data']>

function notice(data: Data) {
  return !data.complete && <UnofficialNotice kind="squads" outcome="seeds" />
}

function renderBody(division: Data['divisions'][number]) {
  return <SeedingBody division={division} />
}

function renderPrint(data: Data, only: string | undefined) {
  return <PrintSeeding results={data} only={only} />
}

/** The link to the finals payouts of one division (PAY-05, D-276): "Pay finals" for a user who may enter them. */
function FinalsPayoutsLink({
  tournamentId,
  divisionId,
}: Readonly<{ tournamentId: string; divisionId: string }>) {
  const canRead = useCan('payouts.read')
  const canWrite = useCan('payouts.write')
  if (!canRead) return null
  return (
    <Link to={`/tournaments/${tournamentId}/seeding/${divisionId}/payouts`}>
      {canWrite ? 'Pay finals' : 'Finals payouts'}
    </Link>
  )
}

/**
 * The finals seeding of the tournament, one division at a time (RES-18 to RES-21a, D-87, D-89,
 * D-92). It says "Unofficial results" until every squad is complete and asks again every 15
 * seconds until then (D-88). The choice of division stays in `?division=`.
 */
export function SeedingPage() {
  return (
    <FinalsDivisionPage
      title="Finals seeding"
      loadingLabel="Loading seeding…"
      useData={useSeeding}
      divisionsOf={(data) => data.divisions}
      notice={notice}
      renderBody={renderBody}
      renderPrint={renderPrint}
      actions={(division, tournamentId) => (
        <FinalsPayoutsLink tournamentId={tournamentId} divisionId={division.id} />
      )}
    />
  )
}
