import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import styles from './DeleteSession.module.css'
import { DeleteSessionDialog } from './DeleteSessionDialog'
import { SessionDeleteRefusedError } from './sessionDeleteApi'
import { word, type SessionKind } from './sessionEditApi'
import { formatSessionDate } from './sessionFormat'
import { Toast } from './Toast'
import { useDeleteSession } from './useDeleteSession'
import { useSessionDeleteInfo } from './useSessionDeleteInfo'

interface SessionToDelete {
  id: string
  date: string
}

/** Reads what depends on the session only while the dialog is open (D-188). */
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
  session: SessionToDelete
  pending: boolean
  failure: string | undefined
  onConfirm: () => void
  onClose: () => void
}>) {
  const info = useSessionDeleteInfo(kind, tournamentId, session.id)
  return (
    <DeleteSessionDialog
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
 * The Delete button of one squad or sweeper card and everything it opens (SQD-14, D-186 to D-189).
 * Callers wrap it in `<Can permission="squads.write">` and hide it for a complete session or
 * tournament: the API still decides. A delete returns to the list with a "deleted" toast; a refusal
 * shows an error toast that stays until dismissed.
 */
export function DeleteSessionButton({
  kind,
  tournamentId,
  session,
}: Readonly<{ kind: SessionKind; tournamentId: string; session: SessionToDelete }>) {
  const navigate = useNavigate()
  const remove = useDeleteSession(kind, tournamentId)
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string | undefined>()
  // Set when the API refused (D-186): shown in a toast after the dialog closes.
  const [refusal, setRefusal] = useState<string[] | undefined>()

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
      await remove.mutateAsync(session.id)
      close()
      // The list reads this state for its "deleted" toast (D-188).
      // Stryker disable next-line StringLiteral,ObjectLiteral,BooleanLiteral: any navigation that sets the state shows the toast; only the history entry and the path spelling differ, which tests cannot see.
      await navigate('.', { replace: true, state: { deleted: true } })
    } catch (error) {
      if (closes.current !== closesAtStart) return
      if (error instanceof SessionDeleteRefusedError) {
        close()
        setRefusal(error.reasons)
      } else {
        // Stryker disable next-line StringLiteral: a failed request always throws an Error; this only satisfies the type.
        setFailure(error instanceof Error ? error.message : `Failed to delete the ${word(kind)}`)
      }
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`Delete ${word(kind)} ${formatSessionDate(session.date)}`}
        onClick={() => {
          setRefusal(undefined)
          setOpen(true)
        }}
      >
        Delete
      </button>
      {open && (
        <OpenDialog
          kind={kind}
          tournamentId={tournamentId}
          session={session}
          pending={remove.isPending}
          failure={failure}
          onConfirm={() => {
            void confirm()
          }}
          onClose={close}
        />
      )}
      {refusal && (
        <Toast
          kind="error"
          onDismiss={() => {
            setRefusal(undefined)
          }}
        >
          <ul className={styles.reasons}>
            {refusal.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Toast>
      )}
    </>
  )
}
