import { AtLargeBody } from './AtLargeTable'
import { FinalsDivisionPage } from './FinalsDivisionPage'
import { PrintAtLarge } from './PrintFinals'
import { UnofficialNotice } from './UnofficialNotice'
import { useAtLarge } from './useResults'

/**
 * The at-large advancers of the tournament, one division at a time (RES-12 to RES-17, D-87, D-89).
 * It says "Unofficial results" until every squad is complete and asks again every 15 seconds until
 * then (D-88). The choice of division stays in `?division=`.
 */
export function AtLargePage() {
  return (
    <FinalsDivisionPage
      title="At-large"
      loadingLabel="Loading at-large results…"
      useData={useAtLarge}
      divisionsOf={(data) => data.divisions}
      notice={(data) => !data.complete && <UnofficialNotice kind="squads" />}
      renderBody={(division, data) => (
        <AtLargeBody division={division} finalsRatio={data.finalsRatio} />
      )}
      renderPrint={(data, only) => <PrintAtLarge results={data} only={only} />}
    />
  )
}
