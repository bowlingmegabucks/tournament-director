import { useOutletContext, useParams } from 'react-router'
import { QueryError } from '../../shared/QueryError'
import { Fact, SessionCard, SessionList } from '../../shared/SessionCard'
import { formatFee, formatRatio, withOverride } from '../../shared/sessionFormat'
import type { Tournament } from '../tournaments/types'
import { useSquads } from './useSquads'

/** The squads of the tournament in the URL, as plain cards (SQD-21, SQD-20, D-44). Read only. */
export function SquadsPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, isPending, error, refetch } = useSquads(id)

  return (
    <>
      <title>{`Squads · ${tournament.name} · Tournament Director`}</title>
      <h1>Squads</h1>
      {isPending && <output>Loading squads…</output>}
      {error && (
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )}
      {data?.length === 0 && <p>No squads yet.</p>}
      {data && data.length > 0 && (
        <SessionList>
          {data.map((squad) => (
            <SessionCard
              key={squad.id}
              session={squad}
              facts={
                <>
                  <Fact label="Entry fee">
                    {withOverride(formatFee(squad.entryFee), squad.entryFeeOverridden)}
                  </Fact>
                  <Fact label="Finals ratio">
                    {withOverride(formatRatio(squad.finalsRatio), squad.finalsRatioOverridden)}
                  </Fact>
                  <Fact label="Cash ratio">
                    {withOverride(formatRatio(squad.cashRatio), squad.cashRatioOverridden)}
                  </Fact>
                </>
              }
            />
          ))}
        </SessionList>
      )}
    </>
  )
}
