import styles from './sessionForm.module.css'
import type { FieldNote } from './sessionEdit'

/**
 * What an edit page tells the director under a box (D-185): a limit to respect, why the box is
 * locked, and why a change asks for a confirmation. Words, not color, carry the difference.
 */
export function FieldNoteLines({
  id,
  note,
}: Readonly<{ id: string; note: FieldNote | undefined }>) {
  if (!note) return null
  return (
    <>
      {note.limit && (
        <p id={`${id}-limit`} className={styles.note}>
          <span className={styles.noteLabel}>Limit:</span> {note.limit}
        </p>
      )}
      {note.lock && (
        <p id={`${id}-lock`} className={styles.note}>
          <span className={styles.noteLabel}>Locked:</span> {note.lock}
        </p>
      )}
      {note.confirm && (
        <p id={`${id}-confirm`} className={styles.note}>
          <span className={styles.noteLabel}>Asks you to confirm:</span> {note.confirm}
        </p>
      )}
    </>
  )
}
