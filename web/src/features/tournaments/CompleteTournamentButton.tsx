import { useRef, useState } from 'react'
import danger from '../../shared/Danger.module.css'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { TournamentCompleteRefusedError, type TournamentCompleteResult } from './completeApi'
import { CompleteTournamentDialog } from './CompleteTournamentDialog'
import type { Tournament } from './types'
import { useCompleteInfo } from './useCompleteInfo'
import { useCompleteTournament } from './useCompleteTournament'

/** Reads what the complete will do only while the dialog is open (D-259). */
function OpenDialog({
  tournament,
  pending,
  failure,
  onConfirm,
  onClose,
}: Readonly<{
  tournament: Tournament
  pending: boolean
  failure: string | undefined
  onConfirm: () => void
  onClose: () => void
}>) {
  const info = useCompleteInfo(tournament.id)
  return (
    <CompleteTournamentDialog
      tournamentName={tournament.name}
      info={info.data}
      loading={info.isPending}
      loadFailure={info.error?.message}
      pending={pending}
      failure={failure}
      onConfirm={onConfirm}
      onRetry={() => {
        void info.refetch()
      }}
      onClose={onClose}
    />
  )
}

/**
 * The "Complete tournament" button and the dialog it opens (TRN-42, TRN-43, D-256 to D-260). The
 * overview shows it inside its Danger zone to a user with `tournaments.write`; the API still
 * decides. It does not show the result itself: the zone goes away once the settings say the
 * tournament is complete, so the caller shows the toast. `onCompleted` gets what the complete
 * closed; `onRefused` gets the reasons when the API said no (the page was out of date).
 */
export function CompleteTournamentButton({
  tournament,
  onCompleted,
  onRefused,
}: Readonly<{
  tournament: Tournament
  onCompleted: (result: TournamentCompleteResult) => void
  onRefused: (reasons: string[]) => void
}>) {
  const complete = useCompleteTournament(tournament.id)
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string | undefined>()

  // Counts each time the dialog closes. A reply that lands after a close belongs to a dialog that
  // is gone, so it must not set state for the next one.
  const closes = useRef(0)

  function close() {
    // Stryker disable next-line AssignmentOperator: counting down also differs from the start value, so the guard works either way.
    closes.current += 1
    setOpen(false)
    setFailure(undefined)
  }

  async function confirm() {
    setFailure(undefined)
    const closesAtStart = closes.current
    try {
      const result = await complete.mutateAsync()
      close()
      onCompleted(result)
    } catch (error) {
      if (closes.current !== closesAtStart) return
      if (error instanceof TournamentCompleteRefusedError) {
        close()
        onRefused(error.reasons)
      } else if (error instanceof TournamentNotFoundError) {
        close()
        onRefused(['This tournament was not found. It may have been removed.'])
      } else {
        // Stryker disable next-line StringLiteral: a failed request always throws an Error; this only satisfies the type.
        setFailure(error instanceof Error ? error.message : 'Failed to complete the tournament')
      }
    }
  }

  return (
    <>
      <button
        type="button"
        className={danger.trigger}
        onClick={() => {
          setOpen(true)
        }}
      >
        Complete tournament
      </button>
      {open && (
        <OpenDialog
          tournament={tournament}
          pending={complete.isPending}
          failure={failure}
          onConfirm={() => {
            void confirm()
          }}
          onClose={close}
        />
      )}
    </>
  )
}
