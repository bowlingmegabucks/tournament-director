import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import danger from '../../shared/Danger.module.css'
import { Toast } from '../../shared/Toast'
import { RegistrationDeleteRefusedError, RegistrationPaidWarningError } from './deleteApi'
import { DeleteRegistrationDialog } from './DeleteRegistrationDialog'
import styles from './DeleteRegistration.module.css'
import { RegistrationNotFoundError } from './editApi'
import { deleteInfoKeys, useDeleteInfo } from './useDeleteInfo'
import { useDeleteRegistration } from './useDeleteRegistration'

interface DeleteRegistrationButtonProps {
  tournamentId: string
  registrationId: string
  bowlerName: string
  /** The visible text: "Delete" on a row, "Delete registration" in a Danger zone. */
  children: string
  /** The accessible name when the visible text alone does not say whose (a row). */
  ariaLabel?: string
}

/** Reads the fees and payments only while the dialog is open (D-212). */
function OpenDialog({
  tournamentId,
  registrationId,
  bowlerName,
  pending,
  failure,
  onConfirm,
  onClose,
}: Readonly<{
  tournamentId: string
  registrationId: string
  bowlerName: string
  pending: boolean
  failure: string | undefined
  onConfirm: (confirmPaid: number | undefined) => void
  onClose: () => void
}>) {
  const info = useDeleteInfo(tournamentId, registrationId)
  return (
    <DeleteRegistrationDialog
      bowlerName={bowlerName}
      info={info.data}
      loading={info.isPending}
      loadFailure={info.error ? info.error.message : undefined}
      onRetry={() => {
        void info.refetch()
      }}
      pending={pending}
      failure={failure}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  )
}

/**
 * The delete trigger of one registration and everything it opens (REG-19, D-209 to D-214). Callers
 * hide it without `registrations.write` and on a complete tournament: the API still decides. A
 * delete goes back to the Registrations list with a toast; a refusal shows an error toast that
 * stays until dismissed. If a payment arrived since the dialog opened, the dialog reads the new
 * total and asks again.
 */
export function DeleteRegistrationButton({
  tournamentId,
  registrationId,
  bowlerName,
  children,
  ariaLabel,
}: Readonly<DeleteRegistrationButtonProps>) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const remove = useDeleteRegistration(tournamentId, registrationId)
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string | undefined>()
  // Set when the API refused (D-211): shown in a toast after the dialog closes.
  const [refusal, setRefusal] = useState<string[] | undefined>()

  // Counts each time the dialog closes. A reply that lands after a close belongs to a dialog that
  // is gone, so it must not set state for the next one.
  const closes = useRef(0)

  function close() {
    closes.current += 1
    setOpen(false)
    setFailure(undefined)
  }

  async function confirm(confirmPaid: number | undefined) {
    setFailure(undefined)
    const closesAtStart = closes.current
    try {
      await remove.mutateAsync(confirmPaid)
      close()
      await navigate(`/tournaments/${tournamentId}/registrations`, {
        state: { updated: `${bowlerName}: Registration deleted.` },
      })
    } catch (error) {
      if (closes.current !== closesAtStart) return
      if (error instanceof RegistrationDeleteRefusedError) {
        close()
        setRefusal(error.reasons)
      } else if (error instanceof RegistrationPaidWarningError) {
        // A payment arrived, or the first call had no total: read the new facts and ask again (D-210).
        setFailure('This registration changed. Review the new total and confirm again.')
        void queryClient.invalidateQueries({
          queryKey: deleteInfoKeys.detail(tournamentId, registrationId),
        })
      } else if (error instanceof RegistrationNotFoundError) {
        close()
        await navigate(`/tournaments/${tournamentId}/registrations`, {
          state: { updated: `${bowlerName}: Registration was already deleted.` },
        })
      } else {
        // Stryker disable next-line StringLiteral: a failed request always throws an Error; this only satisfies the type.
        setFailure(error instanceof Error ? error.message : 'Failed to delete the registration')
      }
    }
  }

  return (
    <>
      <button
        type="button"
        className={danger.trigger}
        aria-label={ariaLabel}
        onClick={() => {
          setRefusal(undefined)
          setOpen(true)
        }}
      >
        {children}
      </button>
      {open && (
        <OpenDialog
          tournamentId={tournamentId}
          registrationId={registrationId}
          bowlerName={bowlerName}
          pending={remove.isPending}
          failure={failure}
          onConfirm={(confirmPaid) => {
            void confirm(confirmPaid)
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
