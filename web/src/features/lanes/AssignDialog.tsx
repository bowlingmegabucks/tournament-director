import { useId, useRef } from 'react'
import { dropOutcome, seatsLeft, type DropTarget } from './dropRules'
import { formatBowler, formatFill, formatPair } from './format'
import styles from './AssignDialog.module.css'
import type { LaneBowler, LanePage, LanePair, SessionKind } from './types'

interface AssignDialogProps {
  bowler: LaneBowler
  kind: SessionKind
  page: LanePage
  onPick: (target: DropTarget) => void
  onClose: () => void
}

// A native modal <dialog> traps focus, closes on Escape, and gives focus back to the button that
// opened it. The ref callback opens it once it is on the page.
function showOnMount(node: HTMLDialogElement | null) {
  if (node && !node.open) node.showModal()
}

function status(pair: LanePair, bowler: LaneBowler): string {
  const outcome = dropOutcome(pair, bowler.registrationId)
  if (outcome === 'same') return 'Current pair'
  if (outcome === 'full') return `Full (${pair.bowlers.length} of ${pair.capacity})`
  const left = seatsLeft(pair)
  return `${left} ${left === 1 ? 'seat' : 'seats'} left (${formatFill(pair)})`
}

/**
 * The way to assign or move a bowler without dragging (WCAG 2.5.7, D-58): a modal listing the
 * pairs, with full ones and the bowler's own pair disabled. A pick does what a drop does.
 */
export function AssignDialog({ bowler, kind, page, onPick, onClose }: Readonly<AssignDialogProps>) {
  const titleId = useId()
  // Where the last mouse press landed, so a drag that ends on the backdrop does not close it.
  const pressedOnBackdrop = useRef(false)
  const placed = bowler.position !== ''

  return (
    // A click outside the box is a mouse shortcut. Keyboard users close it with Escape or Cancel.
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
        if (event.target === event.currentTarget && pressedOnBackdrop.current) {
          event.currentTarget.close()
        }
      }}
    >
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          {placed ? 'Move' : 'Assign'} {bowler.name} to lanes
        </h2>
        <p className={styles.subtitle}>{formatBowler(bowler, kind, false)}</p>
        {/* The list can outgrow the box, so it scrolls and takes the keyboard. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <ul className={styles.list} tabIndex={0} aria-label="Lane pairs">
          {page.pairs.map((pair) => {
            const outcome = dropOutcome(pair, bowler.registrationId)
            return (
              <li key={pair.firstLane}>
                <button
                  type="button"
                  className={styles.pick}
                  disabled={outcome !== 'room'}
                  onClick={(event) => {
                    onPick(pair)
                    event.currentTarget.closest('dialog')?.close()
                  }}
                >
                  <span>{formatPair(pair)}</span>
                  <span className={outcome === 'room' ? styles.room : ''}>
                    {status(pair, bowler)}
                  </span>
                </button>
              </li>
            )
          })}
          {placed && (
            <li>
              <button
                type="button"
                className={styles.pick}
                onClick={(event) => {
                  onPick('unassigned')
                  event.currentTarget.closest('dialog')?.close()
                }}
              >
                <span>Unassigned</span>
                <span>No lane</span>
              </button>
            </li>
          )}
        </ul>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={(event) => {
              event.currentTarget.closest('dialog')?.close()
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  )
}
