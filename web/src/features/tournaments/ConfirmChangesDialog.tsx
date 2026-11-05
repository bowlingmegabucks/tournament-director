import { useId } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import styles from '../../shared/Dialog.module.css'

export interface ConfirmItem {
  /** Also the React key: one warning per field. */
  field: string
  message: string
  /** "Entry fee: $60.00 → $75.00" */
  change: string
}

interface ConfirmChangesDialogProps {
  items: ConfirmItem[]
  pending: boolean
  /** Why the confirmed save did not go through, when it did not. */
  failure?: string
  onConfirm: () => void
  onClose: () => void
}

/**
 * Lists what the API asked the director to confirm (TRN-30, D-129). Go back comes first, so a
 * native modal puts focus there: the safe choice. Escape closes it too.
 */
export function ConfirmChangesDialog({
  items,
  pending,
  failure,
  onConfirm,
  onClose,
}: Readonly<ConfirmChangesDialogProps>) {
  const titleId = useId()
  return (
    <dialog ref={showOnMount} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          Save these changes?
        </h2>
        <ul>
          {items.map((item) => (
            <li key={item.field}>
              {item.message}
              {item.change && (
                <>
                  <br />
                  <small>{item.change}</small>
                </>
              )}
            </li>
          ))}
        </ul>
        {failure && (
          <p role="alert" className={styles.error}>
            {failure}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={pending}
            onClick={closeDialogOf}
          >
            Go back
          </button>
          <button type="button" disabled={pending} onClick={onConfirm}>
            {pending ? 'Saving…' : 'Save anyway'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
