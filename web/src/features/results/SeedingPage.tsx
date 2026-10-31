import { FinalsDivisionPage } from './FinalsDivisionPage'
import { PrintSeeding } from './PrintFinals'
import { SeedingBody } from './SeedingTable'
import { UnofficialNotice } from './UnofficialNotice'
import { useSeeding } from './useResults'

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
      notice={(data) => !data.complete && <UnofficialNotice kind="squads" outcome="seeds" />}
      renderBody={(division) => <SeedingBody division={division} />}
      renderPrint={(data, only) => <PrintSeeding results={data} only={only} />}
    />
  )
}
