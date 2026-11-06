import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Toast } from '../../shared/Toast'
import { DivisionDeleteRefusedError } from './api'
import styles from './DeleteDivision.module.css'
import { DeleteDivisionDialog } from './DeleteDivisionDialog'
import type { Division } from './types'
import { useDeleteDivision } from './useDeleteDivision'
import { useDivisionDeleteInfo } from './useDivisionDeleteInfo'

/** Reads what goes with the division only while the dialog is open (D-154). */
function OpenDialog({
  tournamentId,
  division,
  pending,
  failure,
  onConfirm,
  onClose,
}: Readonly<{
  tournamentId: string
  division: Division
  pending: boolean
  failure: string | undefined
  onConfirm: () => void
  onClose: () => void
}>) {
  const info = useDivisionDeleteInfo(tournamentId, division.id)
  return (
    <DeleteDivisionDialog
      divisionName={division.name}
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
 * The Delete button of one row and everything it opens (DIV-12, D-151 to D-155). Callers wrap it
 * in `<Can permission="divisions.write">` and hide it on a complete tournament: the API still
 * decides. A delete returns to the list with a "Division deleted" toast; a refusal shows an error
 * toast that stays until dismissed.
 */
export function DeleteDivisionButton({
  tournamentId,
  division,
}: Readonly<{ tournamentId: string; division: Division }>) {
  const navigate = useNavigate()
  const remove = useDeleteDivision(tournamentId)
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string | undefined>()
  // Set when the API refused (D-151): shown in a toast after the dialog closes.
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
      await remove.mutateAsync(division.id)
      close()
      // The list reads this state for its "Division deleted" toast (D-154).
      // Stryker disable next-line StringLiteral,ObjectLiteral,BooleanLiteral: any navigation that sets the state shows the toast; only the history entry and the path spelling differ, which tests cannot see.
      await navigate('.', { replace: true, state: { deleted: true } })
    } catch (error) {
      if (closes.current !== closesAtStart) return
      if (error instanceof DivisionDeleteRefusedError) {
        close()
        setRefusal(error.reasons)
      } else {
        // Stryker disable next-line StringLiteral: a failed request always throws an Error; this only satisfies the type.
        setFailure(error instanceof Error ? error.message : 'Failed to delete the division')
      }
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`Delete ${division.name}`}
        onClick={() => {
          setRefusal(undefined)
          setOpen(true)
        }}
      >
        Delete
      </button>
      {open && (
        <OpenDialog
          tournamentId={tournamentId}
          division={division}
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
