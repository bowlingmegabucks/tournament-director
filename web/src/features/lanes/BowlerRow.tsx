import { useDraggable } from '@dnd-kit/react'
import { formatBowler } from './format'
import styles from './BowlerRow.module.css'
import type { LaneBowler, SessionKind } from './types'

interface BowlerRowProps {
  bowler: LaneBowler
  kind: SessionKind
  /** A complete session, or a position that fits no pair: no handle and no button (LAN-13, D-61). */
  readOnly: boolean
  /** The narrow form inside a pair: no average. */
  compact: boolean
  /** The "Assign to lanes" or "Move" button was pressed (D-58). */
  onAssign: (bowler: LaneBowler) => void
}

/**
 * One bowler (LAN-11): name, division, handicap or bonus pins, and the position when there is one.
 * It can be dragged by its handle, or moved with the button, which does the same without dragging
 * (WCAG 2.5.7, D-58).
 */
export function BowlerRow({ bowler, kind, readOnly, compact, onAssign }: Readonly<BowlerRowProps>) {
  const { ref, handleRef, isDragSource } = useDraggable({
    id: bowler.registrationId,
    disabled: readOnly,
  })
  const placed = bowler.position !== ''

  return (
    <li ref={ref} className={`${styles.row} ${isDragSource ? styles.dragging : ''}`}>
      {!readOnly && (
        <button
          ref={handleRef}
          type="button"
          className={styles.handle}
          aria-label={`Drag ${bowler.name}`}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      )}
      {placed && <span className={styles.pos}>{bowler.position}</span>}
      <div>
        <span className={styles.who}>{bowler.name}</span>
        <p className={styles.meta}>{formatBowler(bowler, kind, compact)}</p>
      </div>
      {!readOnly && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            aria-label={placed ? `Move ${bowler.name}` : `Assign to lanes: ${bowler.name}`}
            onClick={() => {
              onAssign(bowler)
            }}
          >
            {placed ? 'Move' : 'Assign to lanes'}
          </button>
        </div>
      )}
    </li>
  )
}

/** The card shown under the pointer while a bowler is dragged. */
export function BowlerPreview({ name }: Readonly<{ name: string }>) {
  return <div className={styles.overlay}>{name}</div>
}
