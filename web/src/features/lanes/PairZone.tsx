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
  onAssign: (bowler: LaneBowler) => void
}

/** One lane pair as a drop zone, with its bowlers sorted lane then letter (LAN-03, LAN-04). */
export function PairZone({ pair, kind, dragging, readOnly, onAssign }: Readonly<PairZoneProps>) {
  const { ref } = useDroppable({ id: pairDropId(pair), disabled: readOnly })
  const outcome = dragging ? dropOutcome(pair, dragging.registrationId) : undefined
  const left = seatsLeft(pair)
  let cue: string | undefined
  if (outcome === 'room') cue = `Drop here: ${left} ${left === 1 ? 'seat' : 'seats'} left`
  if (outcome === 'full') cue = 'Full: cannot drop here'
  let zone = ''
  if (outcome === 'room') zone = styles.canDrop ?? ''
  if (outcome === 'full') zone = styles.cannotDrop ?? ''

  return (
    <li ref={ref} className={`${styles.pair} ${zone}`}>
      <h3 className={styles.title}>
        {formatPair(pair)}{' '}
        {cue ? (
          <span className={styles.cue}>{cue}</span>
        ) : (
          <span className={styles.count}>{formatFill(pair)}</span>
        )}
      </h3>
      {pair.bowlers.length === 0 ? (
        <p className={styles.empty}>No one yet.</p>
      ) : (
        <ul className={styles.bowlers}>
          {pair.bowlers.map((bowler) => (
            <BowlerRow
              key={bowler.registrationId}
              bowler={bowler}
              kind={kind}
              readOnly={readOnly}
              compact
              onAssign={onAssign}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
