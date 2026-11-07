import { useState } from 'react'
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { useTournamentSettings } from '../tournaments/useTournamentSettings'
import type { Tournament } from '../tournaments/types'
import { AddRegistrationForm, type Carry } from './AddRegistrationForm'
import { BowlerNotFoundError } from './bowlerApi'
import { BowlerSearch } from './BowlerSearch'
import { useBowler } from './useBowler'

type Pick = { mode: 'search' } | { mode: 'new' } | { mode: 'stored'; id: string; carry?: Carry }

/**
 * The desk adds a registration (D-157, D-164, D-165): find a bowler or start a new one, then the
 * three steps. Needs `registrations.write`. A complete tournament shows a notice (D-130). The
 * `squad` or `sweeper` query value comes from a lane page and stays checked (REG-22).
 */
export function AddRegistrationPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const [params] = useSearchParams()
  const settings = useTournamentSettings(id)
  const [pick, setPick] = useState<Pick>({ mode: 'search' })
  const stored = useBowler(id, pick.mode === 'stored' ? pick.id : undefined)
  const listUrl = `/tournaments/${id}/registrations`

  const heading = (
    <>
      <title>{`Add registration · ${tournament.name} · Tournament Director`}</title>
      <h1>Add registration</h1>
    </>
  )

  if (settings.isPending) {
    return (
      <>
        {heading}
        <Loading label="Loading…" rows={3} />
      </>
    )
  }
  if (settings.error) {
    return (
      <>
        {heading}
        <QueryError
          error={settings.error}
          onRetry={() => {
            void settings.refetch()
          }}
        />
      </>
    )
  }
  if (settings.data.completed) {
    return (
      <>
        {heading}
        <p>
          <strong>This tournament is complete</strong>
        </p>
        <p>A complete tournament cannot be changed, so you cannot add a registration.</p>
        <Link to={listUrl}>Back to registrations</Link>
      </>
    )
  }

  const toSearch = () => {
    setPick({ mode: 'search' })
  }
  const presetSquadId = params.get('squad') ?? undefined
  const presetSweeperId = params.get('sweeper') ?? undefined

  let body
  if (pick.mode === 'search') {
    body = (
      <BowlerSearch
        tournamentId={id}
        onPick={(bowler) => {
          setPick({ mode: 'stored', id: bowler.id })
        }}
        onNew={() => {
          setPick({ mode: 'new' })
        }}
      />
    )
  } else if (pick.mode === 'new') {
    body = (
      <AddRegistrationForm
        key="new"
        tournamentId={id}
        detail={undefined}
        carry={undefined}
        presetSquadId={presetSquadId}
        presetSweeperId={presetSweeperId}
        onPickAnother={toSearch}
        onUseStored={(bowlerId, carry) => {
          setPick({ mode: 'stored', id: bowlerId, carry })
        }}
      />
    )
  } else if (stored.isPending) {
    body = <Loading label="Loading the bowler…" rows={3} />
  } else if (stored.error instanceof BowlerNotFoundError) {
    body = (
      <>
        <p role="alert">That bowler is no longer on file.</p>
        <button type="button" onClick={toSearch}>
          Search again
        </button>
      </>
    )
  } else if (stored.error) {
    body = (
      <QueryError
        error={stored.error}
        onRetry={() => {
          void stored.refetch()
        }}
      />
    )
  } else {
    body = (
      <AddRegistrationForm
        key={pick.id}
        tournamentId={id}
        detail={stored.data}
        carry={pick.carry}
        presetSquadId={presetSquadId}
        presetSweeperId={presetSweeperId}
        onPickAnother={toSearch}
        onUseStored={(bowlerId, carry) => {
          setPick({ mode: 'stored', id: bowlerId, carry })
        }}
      />
    )
  }

  return (
    <>
      {heading}
      {body}
    </>
  )
}
