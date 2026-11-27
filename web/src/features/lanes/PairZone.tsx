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
  onSetInPlay?: (pair: LanePair, inPlay: boolean) => void
  /** What was asked for while the save is out. */
  savingInPlay?: boolean
  onAssign: (bowler: LaneBowler) => void
  onManage?: (bowler: LaneBowler) => void
}

/** One lane pair as a drop zone, with its bowlers sorted lane then letter (LAN-03, LAN-04). */
export function PairZone({
  pair,
  kind,
  dragging,
  readOnly,
  savingIds,
  fresh = false,
  onSetInPlay,
  savingInPlay,
  onAssign,
  onManage,
}: Readonly<PairZoneProps>) {
  const { ref } = useDroppable({ id: pairDropId(pair), disabled: readOnly })
  const outcome = dragging ? dropOutcome(pair, dragging.registrationId) : undefined
  const left = seatsLeft(pair)
  let cue: string | undefined
  if (outcome === 'room') cue = `Drop here: ${left} ${left === 1 ? 'seat' : 'seats'} left`
  if (outcome === 'full') cue = 'Full: cannot drop here'
  if (outcome === 'out') cue = 'Out of play: cannot drop here'
  let zone = ''
  if (outcome === 'room') zone = styles.canDrop ?? ''
  if (outcome === 'full' || outcome === 'out') zone = styles.cannotDrop ?? ''
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
        {onSetInPlay && (
          <div className={styles.inPlay}>
            <label className={styles.inPlayLabel}>
              {/* Not `disabled` while saving: that would drop keyboard focus to the page. */}
              <input
                type="checkbox"
                aria-label={`${formatPair(pair)} in play`}
                aria-disabled={savingInPlay !== undefined || undefined}
                checked={savingInPlay ?? !pair.outOfPlay}
                onChange={(event) => {
                  if (savingInPlay === undefined) onSetInPlay(pair, event.target.checked)
                }}
              />
              In play
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
