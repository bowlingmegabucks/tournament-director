import { AtLargeBody } from './AtLargeTable'
import { FinalsDivisionPage } from './FinalsDivisionPage'
import { PrintAtLarge } from './PrintFinals'
import { UnofficialNotice } from './UnofficialNotice'
import { useAtLarge } from './useResults'

type Data = NonNullable<ReturnType<typeof useAtLarge>['data']>

function notice(data: Data) {
  return !data.complete && <UnofficialNotice kind="squads" />
}

function renderBody(division: Data['divisions'][number], data: Data) {
  return <AtLargeBody division={division} finalsRatio={data.finalsRatio} />
}

function renderPrint(data: Data, only: string | undefined) {
  return <PrintAtLarge results={data} only={only} />
}

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
      notice={notice}
      renderBody={renderBody}
      renderPrint={renderPrint}
    />
  )
}
