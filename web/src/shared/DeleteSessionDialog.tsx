import { useId } from 'react'
import { closeDialogOf, showOnMount } from './dialogParts'
import styles from './Dialog.module.css'
import type { SessionDeleteInfo } from './sessionDeleteApi'
import { word, type SessionKind } from './sessionEditApi'

interface DeleteSessionDialogProps {
  kind: SessionKind
  /** The session's date, formatted: it names the session in the text. */
  dateLabel: string
  /** What depends on the session. Undefined while it loads, or when it could not be read. */
  info: SessionDeleteInfo | undefined
  /** The read is still going: Delete waits (D-188). */
  loading: boolean
  pending: boolean
  /** Why the request did not go through, when it did not. */
  failure?: string
  onConfirm: () => void
  onClose: () => void
}

/** "1 bowler is" / "12 bowlers are". */
const bowlers = (count: number) => (count === 1 ? '1 bowler is' : `${count} bowlers are`)

/**
 * The delete confirmation for a squad or a sweeper (SQD-14, D-188). Cancel has focus first, so
 * Enter on a fresh dialog is the safe choice. With bowlers entered or scores saved the dialog says
 * why the session stays and offers only Close (D-186). If the counts could not be read the dialog
 * still works: the API refuses safely.
 */
export function DeleteSessionDialog({
  kind,
  dateLabel,
  info,
  loading,
  pending,
  failure,
  onConfirm,
  onClose,
}: Readonly<DeleteSessionDialogProps>) {
  const titleId = useId()
  const name = word(kind)
  const entered = info?.entryCount ?? 0
  const scored = (info?.scoreCount ?? 0) > 0
  const blocked = entered > 0 || scored

  return (
    <dialog ref={showOnMount} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          Delete this {name}?
        </h2>
        {blocked ? (
          <p className={styles.error}>
            {entered > 0 && (
              <>
                {bowlers(entered)} entered in <strong>{dateLabel}</strong>. Remove them from the{' '}
                {name} first.
                {scored && ' Scores are saved for it, so it stays.'}
              </>
            )}
            {entered === 0 && (
              <>
                Scores are saved for <strong>{dateLabel}</strong>, so it cannot be deleted.
              </>
            )}
          </p>
        ) : (
          <p className={styles.text}>
            <strong>{dateLabel}</strong> will be deleted.
            {kind === 'sweepers' && ' Its bonus pins go too.'} This cannot be undone.
          </p>
        )}
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
            {blocked ? 'Close' : 'Cancel'}
          </button>
          {!blocked && (
            <button
              type="button"
              className={styles.destructive}
              disabled={loading || pending}
              onClick={onConfirm}
            >
              {pending ? 'Deleting…' : `Delete ${name}`}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}
