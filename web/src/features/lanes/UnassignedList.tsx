import { useDroppable } from '@dnd-kit/react'
import { BowlerRow } from './BowlerRow'
import { unassignedDropId } from './dropRules'
import styles from './UnassignedList.module.css'
import scroll from './LanesPage.module.css'
import type { LaneBowler, SessionKind } from './types'
import { useId } from 'react'

interface UnassignedListProps {
  bowlers: LaneBowler[]
  kind: SessionKind
  /** The bowler being dragged, if any. A placed one gets a cue here (D-58). */
  dragging: LaneBowler | undefined
  readOnly: boolean
  onAssign: (bowler: LaneBowler) => void
}

/** The bowlers who need a lane (LAN-10, D-58). It scrolls on its own. */
export function UnassignedList({
  bowlers,
  kind,
  dragging,
  readOnly,
  onAssign,
}: Readonly<UnassignedListProps>) {
  const titleId = useId()
  const { ref } = useDroppable({ id: unassignedDropId, disabled: readOnly })
  const accepts = dragging !== undefined && dragging.position !== ''

  return (
    <section aria-labelledby={titleId}>
      {/* The title sits outside the box, level with "Lanes (1 to 24)" (D-58). */}
      <h2 id={titleId} className={scroll.areaTitle}>
        Unassigned ({bowlers.length})
      </h2>
      <div ref={ref} className={`${styles.area} ${accepts ? styles.canDrop : ''}`}>
        {bowlers.length === 0 ? (
          <p className={styles.empty}>Everyone has a lane.</p>
        ) : (
          // A scrolling region must take the keyboard, or its overflow is out of reach.
          <section
            className={`${scroll.scroll} ${styles.scrollOffset}`}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            aria-label="Unassigned bowlers"
          >
            <ul className={styles.bowlers}>
              {bowlers.map((bowler) => (
                <BowlerRow
                  key={bowler.registrationId}
                  bowler={bowler}
                  kind={kind}
                  readOnly={readOnly}
                  compact={false}
                  onAssign={onAssign}
                />
              ))}
            </ul>
          </section>
        )}
        {accepts && <span className={styles.cue}>Drop here to clear the lane</span>}
      </div>
    </section>
  )
}
