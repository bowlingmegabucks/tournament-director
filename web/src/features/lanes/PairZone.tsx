import { useDroppable } from '@dnd-kit/react'
import { BowlerRow } from './BowlerRow'
import { dropOutcome, pairDropId, seatsLeft } from './dropRules'
import { formatFill, formatPair } from './format'
import styles from './PairZone.module.css'
import type { LaneBowler, LanePair, SessionKind } from './types'

interface PairZoneProps {
  pair: LanePair
  kind: SessionKind
  /** The bowler being dragged, if any. Pairs show a cue for them (D-58). */
  dragging: LaneBowler | undefined
  readOnly: boolean
  /** Registrations whose moves are still being saved (D-220). */
  savingIds?: ReadonlySet<string>
  /** Another desk just changed this pair (LAN-21): an accent edge while the status line says so. */
  fresh?: boolean
  /** Takes the pair out of play or brings it back (OOP-03). Without it there is no checkbox. */
  play?: {
    takeOut: (pair: LanePair) => void
    bringBack: (pair: LanePair) => void
  }
  /** What was asked for while the save is out. */
  savingInPlay?: boolean
  onAssign: (bowler: LaneBowler) => void
  onManage?: (bowler: LaneBowler) => void
}

/** What a drag would do here: the words in the header and the outline (D-58). */
function dropCue(pair: LanePair, dragging: LaneBowler | undefined) {
  if (!dragging) return { cue: undefined, zone: '' }
  const outcome = dropOutcome(pair, dragging.registrationId)
  if (outcome === 'room') {
    const left = seatsLeft(pair)
    const cue = `Drop here: ${left} ${left === 1 ? 'seat' : 'seats'} left`
    return { cue, zone: styles.canDrop ?? '' }
  }
  if (outcome === 'full') {
    return { cue: 'Full: cannot drop here', zone: styles.cannotDrop ?? '' }
  }
  if (outcome === 'out') {
    return { cue: 'Out of play: cannot drop here', zone: styles.cannotDrop ?? '' }
  }
  return { cue: undefined, zone: '' }
}

/** One lane pair as a drop zone, with its bowlers sorted lane then letter (LAN-03, LAN-04). */
export function PairZone({
  pair,
  kind,
  dragging,
  readOnly,
  savingIds,
  fresh = false,
  play,
  savingInPlay,
  onAssign,
  onManage,
}: Readonly<PairZoneProps>) {
  const { ref } = useDroppable({ id: pairDropId(pair), disabled: readOnly })
  const { cue, zone } = dropCue(pair, dragging)
  let empty = 'No one yet.'
  if (pair.outOfPlay) empty = 'No one can be put on these lanes.'

  return (
    <li
      ref={ref}
      aria-busy={savingInPlay !== undefined || undefined}
      className={`${styles.pair} ${pair.outOfPlay ? styles.out : ''} ${zone} ${fresh ? styles.fresh : ''}`}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>
          {formatPair(pair)}{' '}
          {cue ? (
            <span className={styles.cue}>{cue}</span>
          ) : (
            <span className={styles.count}>
              {pair.outOfPlay ? 'Out of play' : formatFill(pair)}
            </span>
          )}
        </h3>
        {play && (
          <div className={styles.inPlay}>
            <label className={styles.inPlayLabel}>
              {/* Not `disabled` while saving: that would drop keyboard focus to the page. */}
              <input
                type="checkbox"
                aria-label={`${formatPair(pair)} in play`}
                aria-disabled={savingInPlay !== undefined || undefined}
                checked={savingInPlay ?? !pair.outOfPlay}
                onChange={(event) => {
                  if (savingInPlay !== undefined) return
                  if (event.target.checked) play.bringBack(pair)
                  else play.takeOut(pair)
                }}
              />
              {'In play'}
            </label>
            <span aria-live="polite" className={styles.savingText}>
              {savingInPlay === undefined ? '' : 'Saving…'}
            </span>
          </div>
        )}
      </div>
      {pair.bowlers.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <ul className={styles.bowlers}>
          {pair.bowlers.map((bowler) => (
            <BowlerRow
              key={bowler.registrationId}
              bowler={bowler}
              kind={kind}
              readOnly={readOnly}
              compact
              saving={savingIds?.has(bowler.registrationId)}
              onAssign={onAssign}
              onManage={onManage}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
