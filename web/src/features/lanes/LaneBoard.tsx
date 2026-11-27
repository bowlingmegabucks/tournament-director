import { AddRegistrationLink } from '../registrations/AddRegistrationLink'
import { countBowlers, formatSpots, formatTotals } from './format'
import styles from './LanesPage.module.css'
import { OtherPositions } from './OtherPositions'
import { PairZone } from './PairZone'
import type { LaneBowler, LanePage, SessionKind } from './types'
import { UnassignedList } from './UnassignedList'
import type { usePairPlay } from './usePairPlay'

interface LaneBoardProps {
  kind: SessionKind
  tournamentId: string
  sessionId: string
  view: LanePage
  /** The bowler being dragged, if any. */
  dragging: LaneBowler | undefined
  readOnly: boolean
  /** Registrations whose moves are still being saved (D-220). */
  savingIds: ReadonlySet<string>
  /** First lanes of the pairs another desk just changed (LAN-21). */
  freshPairs: readonly number[] | undefined
  pairPlay: ReturnType<typeof usePairPlay>
  onAssign: (bowler: LaneBowler) => void
  /** Left out when the user may not edit registrations (D-198). */
  onManage: ((bowler: LaneBowler) => void) | undefined
  onRecap: () => void
  onCheckIn: () => void
}

/** The body of the lane page: the totals, the unassigned list, and the lane pairs. */
export function LaneBoard({
  kind,
  tournamentId,
  sessionId,
  view,
  dragging,
  readOnly,
  savingIds,
  freshPairs,
  pairPlay,
  onAssign,
  onManage,
  onRecap,
  onCheckIn,
}: Readonly<LaneBoardProps>) {
  const { session } = view
  // Shown with or without bowlers and lanes (REG-22). The link itself asks for `registrations.write`.
  const addLink = !session.complete && (
    <AddRegistrationLink tournamentId={tournamentId} session={{ kind, id: sessionId }}>
      {`Add registration to this ${kind}`}
    </AddRegistrationLink>
  )

  const noBowlers = countBowlers(view) === 0
  // With pairs, an empty session still shows them: a lane may go out before anyone enters (OOP-03).
  if (noBowlers && view.pairs.length === 0) {
    return (
      <>
        <p>No bowlers have entered this {kind} yet.</p>
        {addLink}
      </>
    )
  }
  if (view.pairs.length === 0) {
    return (
      <>
        <p>
          This {kind} has no lanes set, so there is nowhere to drop a bowler. Set its lanes first.
        </p>
        {addLink}
        <UnassignedList
          bowlers={view.unassigned}
          kind={kind}
          dragging={undefined}
          readOnly
          onAssign={() => undefined}
        />
      </>
    )
  }
  return (
    <>
      {noBowlers && <p>No bowlers have entered this {kind} yet.</p>}
      <div className={styles.stripRow}>
        <ul className={styles.strip} aria-label="Bowlers per division">
          {view.divisions.map((division) => (
            <li key={division.id}>
              {division.name}: {division.entries}
            </li>
          ))}
          <li>
            <strong>{formatTotals(view)}</strong>
          </li>
          <li>
            <strong>{formatSpots(view)}</strong>
          </li>
        </ul>
        <span className={styles.stripActions}>
          {addLink}
          {/* A sheet with nobody on it is no use. */}
          {!noBowlers && (
            <>
              <button type="button" onClick={onRecap}>
                Recap sheets
              </button>
              <button type="button" onClick={onCheckIn}>
                Check-in sheet
              </button>
            </>
          )}
        </span>
      </div>
      {session.complete && (
        <p className={styles.note}>This {kind} is complete. Lanes cannot change.</p>
      )}
      <div className={styles.layout}>
        <UnassignedList
          bowlers={view.unassigned}
          kind={kind}
          dragging={dragging}
          readOnly={readOnly}
          savingIds={savingIds}
          onAssign={onAssign}
          onManage={onManage}
        />
        <section aria-labelledby="lanes-title">
          <h2 id="lanes-title" className={styles.areaTitle}>
            Lanes ({session.startingLane} to {session.startingLane + session.numberOfLanes - 1})
          </h2>
          {/* A scrolling region must take the keyboard, or its overflow is out of reach. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <section className={styles.scroll} tabIndex={0} aria-label="Lane pairs">
            <ul className={styles.pairs}>
              {view.pairs.map((pair) => (
                <PairZone
                  key={pair.firstLane}
                  pair={pair}
                  kind={kind}
                  dragging={dragging}
                  readOnly={readOnly}
                  savingIds={savingIds}
                  fresh={freshPairs?.includes(pair.firstLane)}
                  play={readOnly ? undefined : pairPlay}
                  savingInPlay={pairPlay.saving.get(pair.firstLane)}
                  onAssign={onAssign}
                  onManage={onManage}
                />
              ))}
            </ul>
          </section>
        </section>
      </div>
      {view.other.length > 0 && <OtherPositions bowlers={view.other} kind={kind} />}
    </>
  )
}
