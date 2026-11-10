import { DragDropProvider, DragOverlay } from '@dnd-kit/react'
import { useState } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatSessionDate } from '../../shared/sessionFormat'
import { Toast } from '../../shared/Toast'
import type { Tournament } from '../tournaments/types'
import { LaneSetupError } from '../../shared/session'
import { AssignDialog } from './AssignDialog'
import { BowlerPreview } from './BowlerRow'
import { decideDrop, pairDropId, unassignedDropId, type DropTarget } from './dropRules'
import { countBowlers, formatSpots, formatTotals } from './format'
import styles from './LanesPage.module.css'
import { OtherPositions } from './OtherPositions'
import { PairZone } from './PairZone'
import { useCan } from '../auth/useCan'
import { AddRegistrationLink } from '../registrations/AddRegistrationLink'
import { SessionActionsDialog } from '../registrations/SessionActionsDialog'
import { RecapDialog } from '../recapSheets/RecapDialog'
import type { LaneBowler, LanePage, SessionKind } from './types'
import { UnassignedList } from './UnassignedList'
import { LiveStatus } from './LiveStatus'
import { useLanes } from './useLanes'
import { useMoveBowler } from './useMoveBowler'
import { useSessionEvents } from './useSessionEvents'

/** How long a success notice stays. An error stays until dismissed. */
const INFO_MS = 8000

function everyBowler(page: LanePage): LaneBowler[] {
  return [...page.pairs.flatMap((pair) => pair.bowlers), ...page.unassigned, ...page.other]
}

/**
 * The lane assignments of one squad or sweeper (LAN-10, D-58, D-60): the bowlers who need a lane
 * beside one drop zone per lane pair. A drop on a pair with room, or a placed bowler dropped on the
 * unassigned list, shows at once and saves (LAN-20, D-216, D-220); a refusal puts the bowler back
 * and says why. A full pair refuses before it asks. The page keeps itself fresh over the live
 * stream of the session (LAN-21, D-217), so a second desk's moves and new entries show here.
 */
export function LanesPage({ kind }: Readonly<{ kind: SessionKind }>) {
  // Stryker disable next-line StringLiteral: the route always has these params; this only satisfies the type.
  const { id = '', sessionId = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, isPending, error, refetch } = useLanes(kind, id, sessionId)
  const [draggingId, setDraggingId] = useState<string>()
  const [assigning, setAssigning] = useState<LaneBowler>()
  const [managing, setManaging] = useState<LaneBowler>()
  // Edit, move, and remove need `registrations.write` (D-198). The lanes API read needs only `lanes.read`.
  const canManage = useCan('registrations.write')
  const [recapOpen, setRecapOpen] = useState(false)
  const [toast, setToast] = useState<{ kind: 'info' | 'success' | 'error'; text: string }>()
  // Moving a bowler needs `lanes.assign` (D-216). A score keeper may watch the lanes but not change them.
  const canAssign = useCan('lanes.assign')
  const { move, savingIds } = useMoveBowler(kind, id, sessionId)
  // A complete session cannot change, so it needs no stream (D-10, D-217).
  const live = useSessionEvents(kind, id, sessionId, data !== undefined && !data.session.complete)

  if (isPending) return <Loading label="Loading lane assignments…" rows={4} />
  if (error instanceof LaneSetupError) return <p role="alert">{error.message}</p>
  if (error) {
    return (
      <QueryError
        error={error}
        onRetry={() => {
          void refetch()
        }}
      />
    )
  }

  const { session } = data
  // A complete session says so; a user who may not assign sees no controls and no line about it.
  const readOnly = session.complete || !canAssign
  const view = data
  const bowlers = everyBowler(view)
  const dragging = bowlers.find((bowler) => bowler.registrationId === draggingId)

  // One place decides what a drop or a dialog pick does (D-58, D-220).
  function attempt(bowler: LaneBowler, target: DropTarget) {
    const decision = decideDrop(bowler, target)
    if (decision.type === 'refuse') {
      setToast({ kind: 'error', text: decision.message })
    } else if (decision.type === 'move') {
      move(
        {
          registrationId: bowler.registrationId,
          lane: target === 'unassigned' ? null : target.firstLane,
          guess: decision.move,
        },
        {
          onError: (failure) => {
            setToast({ kind: 'error', text: failure.message })
          },
        },
      )
    }
  }

  let body
  if (countBowlers(view) === 0) {
    body = <p>No bowlers have entered this {kind} yet.</p>
  } else if (view.pairs.length === 0) {
    body = (
      <>
        <p>
          This {kind} has no lanes set, so there is nowhere to drop a bowler. Set its lanes first.
        </p>
        <UnassignedList
          bowlers={view.unassigned}
          kind={kind}
          dragging={undefined}
          readOnly
          onAssign={() => undefined}
        />
      </>
    )
  } else {
    body = (
      <>
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
            {!readOnly && (
              <AddRegistrationLink tournamentId={id} session={{ kind, id: sessionId }}>
                {`Add registration to this ${kind}`}
              </AddRegistrationLink>
            )}
            <button
              type="button"
              onClick={() => {
                setRecapOpen(true)
              }}
            >
              Recap sheets
            </button>
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
            onAssign={setAssigning}
            onManage={canManage ? setManaging : undefined}
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
                    fresh={live.updated?.pairs.includes(pair.firstLane)}
                    onAssign={setAssigning}
                    onManage={canManage ? setManaging : undefined}
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

  return (
    <DragDropProvider
      onDragStart={({ operation }) => {
        setDraggingId(operation.source ? String(operation.source.id) : undefined)
      }}
      onDragEnd={({ operation, canceled }) => {
        setDraggingId(undefined)
        const source = operation.source
        const target = operation.target
        if (canceled || !source || !target) return
        const bowler = bowlers.find((candidate) => candidate.registrationId === String(source.id))
        if (!bowler) return
        if (String(target.id) === unassignedDropId) {
          attempt(bowler, 'unassigned')
          return
        }
        const pair = view.pairs.find((candidate) => pairDropId(candidate) === String(target.id))
        if (pair) attempt(bowler, pair)
      }}
    >
      <title>{`Lane assignments · ${formatSessionDate(session.date)} · ${tournament.name} · Tournament Director`}</title>
      {!session.complete && <LiveStatus state={live.state} updated={live.updated?.text} />}
      {body}
      <DragOverlay>{dragging ? <BowlerPreview name={dragging.name} /> : null}</DragOverlay>
      {assigning && (
        <AssignDialog
          bowler={assigning}
          kind={kind}
          page={view}
          onPick={(target) => {
            attempt(assigning, target)
          }}
          onClose={() => {
            setAssigning(undefined)
          }}
        />
      )}
      {managing && (
        <SessionActionsDialog
          tournamentId={id}
          kind={kind}
          sessionId={sessionId}
          bowler={{ registrationId: managing.registrationId, name: managing.name }}
          onDone={(text) => {
            setToast({ kind: 'success', text })
          }}
          onClose={() => {
            setManaging(undefined)
          }}
        />
      )}
      {recapOpen && (
        <RecapDialog
          kind={kind}
          tournamentId={id}
          sessionId={sessionId}
          onClose={() => {
            setRecapOpen(false)
          }}
        />
      )}
      {toast && (
        <Toast
          kind={toast.kind}
          autoDismissMs={toast.kind === 'error' ? undefined : INFO_MS}
          onDismiss={() => {
            setToast(undefined)
          }}
        >
          {toast.text}
        </Toast>
      )}
    </DragDropProvider>
  )
}
