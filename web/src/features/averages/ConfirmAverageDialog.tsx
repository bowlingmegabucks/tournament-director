import { useId, useState } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import styles from '../../shared/Dialog.module.css'
import own from './Averages.module.css'

interface ConfirmAverageDialogProps {
  /** What the API said would change (D-294). */
  message: string
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * The confirm before a change of average alters the results of a bowler with scores (AVG-06,
 * D-294). The API answered 409 with the warning; the director sends the change again to confirm.
 */
export function ConfirmAverageDialog({
  message,
  pending,
  onConfirm,
  onClose,
}: Readonly<ConfirmAverageDialogProps>) {
  const titleId = useId()
  const [open] = useState(() => (node: HTMLDialogElement | null) => {
    showOnMount(node)
  })
  return (
    <dialog
      ref={open}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (pending) event.preventDefault()
      }}
      onClose={onClose}
    >
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          Change results?
        </h2>
        <p className={own.notice}>{message}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={pending}
            onClick={closeDialogOf}
          >
            Cancel
          </button>
          <button type="button" disabled={pending} onClick={onConfirm}>
            {pending ? 'Saving…' : 'Change anyway'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
