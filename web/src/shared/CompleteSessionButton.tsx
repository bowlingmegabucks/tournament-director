import { useRef, useState } from 'react'
import { CompleteSessionDialog } from './CompleteSessionDialog'
import { SessionCompleteRefusedError } from './sessionCompleteApi'
import { word, type SessionKind } from './sessionEditApi'
import { formatSessionDate } from './sessionFormat'
import { useCompleteSession } from './useCompleteSession'
import { useSessionCompleteInfo } from './useSessionCompleteInfo'

interface SessionToComplete {
  id: string
  date: string
}

/** Reads what the complete will do only while the dialog is open (D-194). */
function OpenDialog({
  kind,
  tournamentId,
  session,
  pending,
  failure,
  onConfirm,
  onClose,
}: Readonly<{
  kind: SessionKind
  tournamentId: string
  session: SessionToComplete
  pending: boolean
  failure: string | undefined
  onConfirm: () => void
  onClose: () => void
}>) {
  const info = useSessionCompleteInfo(kind, tournamentId, session.id)
  return (
    <CompleteSessionDialog
      kind={kind}
      dateLabel={formatSessionDate(session.date)}
      info={info.data}
      loading={info.isPending}
      pending={pending}
      failure={failure}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  )
}

/**
 * The Complete button of a squad or sweeper page and the dialog it opens (SQD-15, SQD-16, D-190 to
 * D-195). Callers wrap it in `<Can permission="squads.write">` and hide it for a complete session
 * or tournament: the API still decides. It does not show the result itself: the status flips and
 * this button goes away, so the caller shows the toast. `onCompleted` gets how many bowlers got
 * zeros; `onRefused` gets the reasons when the API said no (the page was out of date).
 */
export function CompleteSessionButton({
  kind,
  tournamentId,
  session,
  onCompleted,
  onRefused,
}: Readonly<{
  kind: SessionKind
  tournamentId: string
  session: SessionToComplete
  onCompleted: (result: { noShowCount: number }) => void
  onRefused: (reasons: string[]) => void
}>) {
  const complete = useCompleteSession(kind, tournamentId)
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
      const result = await complete.mutateAsync(session.id)
      close()
      onCompleted(result)
    } catch (error) {
      if (closes.current !== closesAtStart) return
      if (error instanceof SessionCompleteRefusedError) {
        close()
        onRefused(error.reasons)
      } else {
        // Stryker disable next-line StringLiteral: a failed request always throws an Error; this only satisfies the type.
        setFailure(error instanceof Error ? error.message : `Failed to complete the ${word(kind)}`)
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        Complete {word(kind)}
      </button>
      {open && (
        <OpenDialog
          kind={kind}
          tournamentId={tournamentId}
          session={session}
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
