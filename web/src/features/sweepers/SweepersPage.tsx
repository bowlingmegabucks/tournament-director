import { useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Fact, SessionCard, SessionList } from '../../shared/SessionCard'
import { formatFee, formatRatio } from '../../shared/sessionFormat'
import type { Tournament } from '../tournaments/types'
import { BonusPinsList } from './BonusPinsList'
import { useSweepers } from './useSweepers'

/**
 * The sweepers of the tournament in the URL, as plain cards (SQD-22, SQD-20, D-44). Read only.
 * A division with no bonus pins is not listed, so a missing name means 0 (D-45).
 */
export function SweepersPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, isPending, error, refetch } = useSweepers(id)

  return (
    <>
      <title>{`Sweepers · ${tournament.name} · Tournament Director`}</title>
      <h1>Sweepers</h1>
      {isPending && <Loading label="Loading sweepers…" rows={6} />}
      {error && (
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )}
      {data?.length === 0 && <p>No sweepers yet.</p>}
      {data && data.length > 0 && (
        <SessionList>
          {data.map((sweeper) => (
            <SessionCard
              key={sweeper.id}
              session={sweeper}
              href={sweeper.id}
              facts={
                <>
                  <Fact label="Entry fee">{formatFee(sweeper.entryFee)}</Fact>
                  <Fact label="Games">{sweeper.games}</Fact>
                  <Fact label="Cash ratio">{formatRatio(sweeper.cashRatio)}</Fact>
                </>
              }
            >
              <BonusPinsList bonusPins={sweeper.bonusPins} />
            </SessionCard>
          ))}
        </SessionList>
      )}
    </>
  )
}
