import { useId } from 'react'
import { BowlerRow } from './BowlerRow'
import styles from './LanesPage.module.css'
import bowlerStyles from './UnassignedList.module.css'
import type { LaneBowler, SessionKind } from './types'

/**
 * Bowlers whose stored position fits no pair of this session, with the raw text (D-61). Nothing is
 * hidden, so the director can check them against the session's lanes. Read only.
 */
export function OtherPositions({
  bowlers,
  kind,
}: Readonly<{ bowlers: LaneBowler[]; kind: SessionKind }>) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={styles.other}>
      <h2 id={titleId} className={styles.areaTitle}>
        Other positions ({bowlers.length})
      </h2>
      <p className={styles.note}>
        These positions are not on a pair of this {kind}. Check them against its lanes.
      </p>
      <ul className={bowlerStyles.bowlers}>
        {bowlers.map((bowler) => (
          <BowlerRow
            key={bowler.registrationId}
            bowler={bowler}
            kind={kind}
            readOnly
            compact
            onAssign={() => undefined}
          />
        ))}
      </ul>
    </section>
  )
}
