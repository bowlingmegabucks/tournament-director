import { useId } from 'react'
import { closeDialogOf, showOnMount } from './dialogParts'
import styles from './Dialog.module.css'

export interface ConfirmItem {
  /** Also the React key: one warning per field. */
  field: string
  message: string
  /** "Entry fee: $60.00 → $75.00" */
  change: string
}

interface ConfirmChangesDialogProps {
  items: ConfirmItem[]
  /** Defaults to "Save these changes?" */
  title?: string
  /** The button that goes ahead. Defaults to "Save anyway"; while `pending` it says "Saving…". */
  confirmLabel?: string
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
  title = 'Save these changes?',
  confirmLabel = 'Save anyway',
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
          {title}
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
            {pending ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
