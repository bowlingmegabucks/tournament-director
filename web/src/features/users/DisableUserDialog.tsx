import { useId } from 'react'
import { closeDialogOf, showOnMount } from './dialogParts'
import type { ListedUser } from './types'
import styles from './UserDialog.module.css'

interface DisableUserDialogProps {
  user: ListedUser
  onConfirm: () => void
  onClose: () => void
}

/** Disabling signs the person out at once, so the admin confirms first. */
export function DisableUserDialog({ user, onConfirm, onClose }: Readonly<DisableUserDialogProps>) {
  const titleId = useId()
  return (
    <dialog ref={showOnMount} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          Disable {user.name}?
        </h2>
        <p className={styles.text}>
          They are signed out at once and cannot sign in until you enable them again. Their history
          stays.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={closeDialogOf}>
            Cancel
          </button>
          <button
            type="button"
            onClick={(event) => {
              onConfirm()
              closeDialogOf(event)
            }}
          >
            Disable
          </button>
        </div>
      </div>
    </dialog>
  )
}
