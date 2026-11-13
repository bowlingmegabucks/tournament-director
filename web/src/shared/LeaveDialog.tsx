import { useId } from 'react'
import type { Blocker } from 'react-router'
import { closeDialogOf, showOnMount } from './dialogParts'
import styles from './Dialog.module.css'

/**
 * The question a held move raises (see `useLeaveGuard`). Stay comes first, so a native modal puts
 * focus there: the safe choice. Escape means Stay.
 */
export function LeaveDialog({ blocker }: Readonly<{ blocker: Blocker }>) {
  const titleId = useId()
  if (blocker.state !== 'blocked') return null
  return (
    <dialog
      ref={showOnMount}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={() => {
        blocker.reset()
      }}
    >
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          Leave without saving?
        </h2>
        <p className={styles.text}>
          You changed this form and did not save. Leaving loses the changes.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={closeDialogOf}>
            Stay on this page
          </button>
          <button
            type="button"
            className={styles.destructive}
            onClick={() => {
              blocker.proceed()
            }}
          >
            Leave page
          </button>
        </div>
      </div>
    </dialog>
  )
}
