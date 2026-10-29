import { DragDropProvider, DragOverlay } from '@dnd-kit/react'
import { useState } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatSessionDate } from '../../shared/sessionFormat'
import { Toast } from '../../shared/Toast'
import type { Tournament } from '../tournaments/types'
import { LaneSetupError } from './api'
import { AssignDialog } from './AssignDialog'
import { BowlerPreview } from './BowlerRow'
import { dropMessage, pairDropId, unassignedDropId, type DropTarget } from './dropRules'
import { countBowlers, formatTotals } from './format'
import styles from './LanesPage.module.css'
import { OtherPositions } from './OtherPositions'
import { PairZone } from './PairZone'
import type { LaneBowler, LanePage, SessionKind } from './types'
import { UnassignedList } from './UnassignedList'
import { useLanes } from './useLanes'

function everyBowler(page: LanePage): LaneBowler[] {
  return [...page.pairs.flatMap((pair) => pair.bowlers), ...page.unassigned, ...page.other]
}

/**
 * The lane assignments of one squad or sweeper (LAN-10, D-58, D-60): the bowlers who need a lane
 * beside one drop zone per lane pair. Read only for now: a drop on a pair with room, or on the
 * unassigned list, shows a "not built yet" error and moves no one (D-55). A full pair refuses.
 */
export function LanesPage({ kind }: Readonly<{ kind: SessionKind }>) {
  // Stryker disable next-line StringLiteral: the route always has these params; this only satisfies the type.
  const { id = '', sessionId = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, isPending, error, refetch } = useLanes(kind, id, sessionId)
  const [draggingId, setDraggingId] = useState<string>()
  const [assigning, setAssigning] = useState<LaneBowler>()
  const [toast, setToast] = useState<string>()

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
  const readOnly = session.complete
  const bowlers = everyBowler(data)
  const dragging = bowlers.find((bowler) => bowler.registrationId === draggingId)

  // One place decides what a drop or a dialog pick does (D-55, D-58).
  function attempt(bowler: LaneBowler, target: DropTarget) {
    const message = dropMessage(bowler, target)
    if (message) setToast(message)
  }

  let body
  if (countBowlers(data) === 0) {
    body = <p>No bowlers have entered this {kind} yet.</p>
  } else if (data.pairs.length === 0) {
    body = (
      <>
        <p>
          This {kind} has no lanes set, so there is nowhere to drop a bowler. Set its lanes first.
        </p>
        <UnassignedList
          bowlers={data.unassigned}
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
        <ul className={styles.strip} aria-label="Bowlers per division">
          {data.divisions.map((division) => (
            <li key={division.id}>
              {division.name}: {division.entries}
            </li>
          ))}
          <li>
            <strong>{formatTotals(data)}</strong>
          </li>
        </ul>
        {readOnly && <p className={styles.note}>This {kind} is complete. Lanes cannot change.</p>}
        <div className={styles.layout}>
          <UnassignedList
            bowlers={data.unassigned}
            kind={kind}
            dragging={dragging}
            readOnly={readOnly}
            onAssign={setAssigning}
          />
          <section aria-labelledby="lanes-title">
            <h2 id="lanes-title" className={styles.areaTitle}>
              Lanes ({session.startingLane} to {session.startingLane + session.numberOfLanes - 1})
            </h2>
            {/* A scrolling region must take the keyboard, or its overflow is out of reach. */}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
            <div className={styles.scroll} tabIndex={0} role="region" aria-label="Lane pairs">
              <ul className={styles.pairs}>
                {data.pairs.map((pair) => (
                  <PairZone
                    key={pair.firstLane}
                    pair={pair}
                    kind={kind}
                    dragging={dragging}
                    readOnly={readOnly}
                    onAssign={setAssigning}
                  />
                ))}
              </ul>
            </div>
          </section>
        </div>
        {data.other.length > 0 && <OtherPositions bowlers={data.other} kind={kind} />}
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
        const pair = data.pairs.find((candidate) => pairDropId(candidate) === String(target.id))
        if (pair) attempt(bowler, pair)
      }}
    >
      <title>{`Lane assignments · ${formatSessionDate(session.date)} · ${tournament.name} · Tournament Director`}</title>
      {body}
      <DragOverlay>{dragging ? <BowlerPreview name={dragging.name} /> : null}</DragOverlay>
      {assigning && (
        <AssignDialog
          bowler={assigning}
          kind={kind}
          page={data}
          onPick={(target) => {
            attempt(assigning, target)
          }}
          onClose={() => {
            setAssigning(undefined)
          }}
        />
      )}
      {toast && (
        <Toast
          kind="error"
          onDismiss={() => {
            setToast(undefined)
          }}
        >
          {toast}
        </Toast>
      )}
    </DragDropProvider>
  )
}
