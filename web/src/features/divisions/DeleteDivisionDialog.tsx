import { useId } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import styles from '../../shared/Dialog.module.css'
import type { DivisionDeleteInfo } from './types'

interface DeleteDivisionDialogProps {
  divisionName: string
  /** What goes with the division. Undefined while it loads, or when it could not be read. */
  info: DivisionDeleteInfo | undefined
  /** The read is still going: Delete waits (D-154). */
  loading: boolean
  pending: boolean
  /** Why the request did not go through, when it did not. */
  failure?: string
  onConfirm: () => void
  onClose: () => void
}

/** "1 bowler is" / "12 bowlers are". */
const bowlers = (count: number) => (count === 1 ? '1 bowler is' : `${count} bowlers are`)

/** "1 sweeper loses its bonus pins for it." / "2 sweepers lose their bonus pins for it." */
const pins = (count: number) =>
  count === 1
    ? '1 sweeper loses its bonus pins for it.'
    : `${count} sweepers lose their bonus pins for it.`

/**
 * The delete confirmation (DIV-12, D-154). Cancel has focus first, so Enter on a fresh dialog is
 * the safe choice. With bowlers registered the dialog says why the division stays and offers only
 * Close (D-151). If the counts could not be read the dialog still works: the API refuses safely.
 */
export function DeleteDivisionDialog({
  divisionName,
  info,
  loading,
  pending,
  failure,
  onConfirm,
  onClose,
}: Readonly<DeleteDivisionDialogProps>) {
  const titleId = useId()
  const blocked = info !== undefined && info.registrationCount > 0

  // Loading says the short version; a failed read says pins may go; a read answer says how many.
  const sentences: string[] = []
  if (info === undefined) {
    if (!loading) sentences.push('Any sweeper bonus pins for it go too.')
  } else if (info.sweeperCount > 0) {
    sentences.push(pins(info.sweeperCount))
  }
  if (!loading) sentences.push('Divisions after it move up one number.')
  sentences.push('This cannot be undone.')

  return (
    <dialog ref={showOnMount} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          Delete this division?
        </h2>
        {blocked ? (
          <p className={styles.error}>
            {bowlers(info.registrationCount)} registered in <strong>{divisionName}</strong>. Move
            them to another division first.
          </p>
        ) : (
          <p className={styles.text}>
            <strong>{divisionName}</strong> will be deleted. {sentences.join(' ')}
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
              {pending ? 'Deleting…' : 'Delete division'}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}
