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

function Details({
  bowler,
  kind,
  compact,
}: Readonly<Pick<BowlerRowProps, 'bowler' | 'kind' | 'compact'>>) {
  return (
    <div>
      <span className={styles.who}>{bowler.name}</span>
      <p className={styles.meta}>{formatBowler(bowler, kind, compact)}</p>
    </div>
  )
}

/** A row nobody can drag: a complete session (LAN-13), or a position that fits no pair (D-61). */
function StaticRow({
  bowler,
  kind,
  compact,
}: Readonly<Omit<BowlerRowProps, 'readOnly' | 'onAssign'>>) {
  return (
    <li className={styles.row}>
      {bowler.position !== '' && <span className={styles.pos}>{bowler.position}</span>}
      <Details bowler={bowler} kind={kind} compact={compact} />
    </li>
  )
}

// The drag library marks the row itself as a draggable button when it has no handle, which is not
// valid inside a list. So a row nobody can drag skips `useDraggable` altogether.
function DraggableRow({
  bowler,
  kind,
  compact,
  onAssign,
}: Readonly<Omit<BowlerRowProps, 'readOnly'>>) {
  const { ref, handleRef, isDragSource } = useDraggable({ id: bowler.registrationId })
  const placed = bowler.position !== ''

  return (
    <li
      ref={ref}
      className={`${styles.row} ${placed ? styles.placed : ''} ${isDragSource ? styles.dragging : ''}`}
    >
      <button
        ref={handleRef}
        type="button"
        className={styles.handle}
        aria-label={`Drag ${bowler.name}`}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      {placed && <span className={styles.pos}>{bowler.position}</span>}
      <Details bowler={bowler} kind={kind} compact={compact} />
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
    </li>
  )
}

/**
 * One bowler (LAN-11): name, division, handicap or bonus pins, and the position when there is one.
 * An open row can be dragged by its handle, or moved with the button, which does the same without
 * dragging (WCAG 2.5.7, D-58).
 */
export function BowlerRow({ readOnly, ...props }: Readonly<BowlerRowProps>) {
  return readOnly ? <StaticRow {...props} /> : <DraggableRow {...props} />
}

/** The card shown under the pointer while a bowler is dragged. */
export function BowlerPreview({ name }: Readonly<{ name: string }>) {
  return <div className={styles.overlay}>{name}</div>
}
