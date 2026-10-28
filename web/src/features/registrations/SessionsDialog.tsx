import { useId, useRef } from 'react'
import { formatSessionDate } from '../../shared/sessionFormat'
import styles from './SessionsDialog.module.css'
import type { SessionEntries } from './types'

interface SessionsDialogProps {
  bowlerName: string
  /** `squads` or `sweepers`, as it reads in the title. */
  kind: 'squads' | 'sweepers'
  /** Every squad (or sweeper) of the tournament, in date order. */
  all: SessionEntries[]
  /** The ids the bowler entered. */
  entered: string[]
  onClose: () => void
}

// A native modal <dialog> traps focus, closes on Escape, and gives focus back to the count that
// opened it. The ref callback opens it once it is on the page.
function showOnMount(node: HTMLDialogElement | null) {
  if (node && !node.open) node.showModal()
}

/**
 * The squads or sweepers one bowler entered, with date, time, and Open or Complete (REG-28, D-54).
 * Read only. Escape, the Close button, or a click outside the box closes it.
 */
export function SessionsDialog({
  bowlerName,
  kind,
  all,
  entered,
  onClose,
}: Readonly<SessionsDialogProps>) {
  const titleId = useId()
  // Where the last mouse press landed. A drag that starts in the box and ends on the backdrop
  // fires a click on the dialog too, and must not close it.
  const pressedOnBackdrop = useRef(false)
  const listed = all.filter((session) => entered.includes(session.id))
  const noun = kind === 'squads' ? 'squad' : 'sweeper'
  return (
    // A click outside the box is a mouse shortcut. Keyboard users close it with Escape or the Close button.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={showOnMount}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        // The dialog has no padding of its own: the content wrapper fills it. So a press and a
        // click that both land on the dialog element itself are on the backdrop.
        if (event.target === event.currentTarget && pressedOnBackdrop.current) {
          event.currentTarget.close()
        }
      }}
    >
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          {bowlerName}: {kind}
        </h2>
        <p className={styles.subtitle}>
          {listed.length} of {all.length} {all.length === 1 ? noun : `${noun}s`}
        </p>
        <ul className={styles.list}>
          {listed.map((session) => (
            <li key={session.id} className={styles.item}>
              <span>{formatSessionDate(session.date)}</span>
              <span className={styles.status}>{session.complete ? 'Complete' : 'Open'}</span>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={(event) => {
              event.currentTarget.closest('dialog')?.close()
            }}
          >
            Close
          </button>
        </div>
      </div>
    </dialog>
  )
}
