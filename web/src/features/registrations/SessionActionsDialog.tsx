import { useState } from 'react'
import { Link } from 'react-router'
import { Loading } from '../../shared/Loading'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import dialog from '../../shared/Dialog.module.css'
import type { SessionKind } from '../../shared/session'
import { formatSessionDate } from '../../shared/sessionFormat'
import { useSquads } from '../squads/useSquads'
import { useSweepers } from '../sweepers/useSweepers'
import { formatFee } from '../tournaments/format'
import { DeskRejectedError } from './bowlerApi'
import { RegistrationChangedError } from './editApi'
import { netText, sessionChange } from './editForm'
import type { EditInfo, EditRegistrationRequest } from './types'
import { useEditInfo } from './useEditInfo'
import { useEditRegistration } from './useEditRegistration'
import styles from './SessionActions.module.css'

interface SessionActionsDialogProps {
  tournamentId: string
  kind: SessionKind
  /** The squad or sweeper whose lane page this is: the source of a remove or a move (D-202). */
  sessionId: string
  bowler: { registrationId: string; name: string }
  /** Called after a save, with the sentence for the toast. */
  onDone: (message: string) => void
  onClose: () => void
}

interface Session {
  id: string
  date: string
  complete: boolean
  entryFee: number
}

type Mode = 'menu' | 'move' | 'remove'

const messageOf = (error: unknown): string => {
  if (error instanceof RegistrationChangedError) {
    return 'This registration changed. Close this and try again.'
  }
  if (error instanceof DeskRejectedError) {
    return Object.values(error.errors)[0] ?? error.message
  }
  return error instanceof Error ? error.message : 'Failed to save the change'
}

interface ViewProps {
  kind: SessionKind
  source: Session
  info: EditInfo
  sessions: Session[]
  name: string
  pending: boolean
  failure: string | undefined
  onSave: (request: EditRegistrationRequest) => void
  onBack: () => void
}

function RemoveView({ kind, source, name, pending, failure, onSave, onBack }: Readonly<ViewProps>) {
  return (
    <>
      <h2 className={dialog.title}>
        Remove {name} from this {kind}?
      </h2>
      <p className={dialog.text}>
        The entry for <strong>{formatSessionDate(source.date)}</strong> ends and the lane is freed.
      </p>
      <p className={dialog.text}>
        <strong>Refund may be due: {formatFee(source.entryFee)}</strong>, handled outside the app.
      </p>
      {failure && (
        <p role="alert" className={dialog.error}>
          {failure}
        </p>
      )}
      <div className={dialog.actions}>
        <button type="button" className={dialog.secondary} disabled={pending} onClick={onBack}>
          Cancel
        </button>
        <button
          type="button"
          className={dialog.destructive}
          disabled={pending}
          onClick={() => {
            onSave(sessionChange(kind, source.id))
          }}
        >
          {pending ? 'Removing…' : `Remove from ${kind}`}
        </button>
      </div>
    </>
  )
}

function MoveView({
  kind,
  source,
  info,
  sessions,
  name,
  pending,
  failure,
  onSave,
  onBack,
}: Readonly<ViewProps>) {
  const held = [...info.registration.squadIds, ...info.registration.sweeperIds]
  const targets = sessions.filter(
    (session) => session.id !== source.id && !held.includes(session.id),
  )
  const [chosen, setChosen] = useState<string>()
  const target = targets.find((session) => session.id === chosen && !session.complete)
  const net = target ? target.entryFee - source.entryFee : 0
  return (
    <>
      <h2 className={dialog.title}>
        Move {name} to another {kind}
      </h2>
      {targets.length === 0 ? (
        <p className={dialog.text}>No other {kind} to move to.</p>
      ) : (
        <fieldset className={styles.targets}>
          <legend>Move to</legend>
          {targets.map((session) => (
            <label
              key={session.id}
              className={`${styles.target} ${session.complete ? styles.off : ''}`}
            >
              <input
                type="radio"
                name="move-target"
                value={session.id}
                disabled={session.complete}
                checked={chosen === session.id}
                onChange={() => {
                  setChosen(session.id)
                }}
              />
              <span>
                {formatSessionDate(session.date)} · {formatFee(session.entryFee)}
              </span>
              {session.complete && <span className={styles.badge}>Complete</span>}
            </label>
          ))}
        </fieldset>
      )}
      {target && (
        <p className={dialog.text}>
          From {formatSessionDate(source.date)} ({formatFee(source.entryFee)}) to{' '}
          {formatSessionDate(target.date)} ({formatFee(target.entryFee)}).{' '}
          <strong>{netText(net)}</strong> {name} lands in the unassigned list.
        </p>
      )}
      {failure && (
        <p role="alert" className={dialog.error}>
          {failure}
        </p>
      )}
      <div className={dialog.actions}>
        <button type="button" className={dialog.secondary} disabled={pending} onClick={onBack}>
          Cancel
        </button>
        <button
          type="button"
          disabled={pending || target === undefined}
          onClick={() => {
            if (target) onSave(sessionChange(kind, source.id, target.id))
          }}
        >
          {pending ? 'Moving…' : 'Move'}
        </button>
      </div>
    </>
  )
}

interface MenuProps {
  tournamentId: string
  kind: SessionKind
  source: Session
  info: EditInfo
  name: string
  onMode: (mode: Mode) => void
}

function Menu({ tournamentId, kind, source, info, name, onMode }: Readonly<MenuProps>) {
  const scored = info.locks.scoredSessionIds.includes(source.id)
  const lock = source.complete
    ? `This ${kind} is complete.`
    : scored && `${name} has scores in this ${kind}.`
  return (
    <>
      <h2 className={dialog.title}>{name}</h2>
      <ul className={styles.menu}>
        <li>
          <Link
            className={styles.link}
            to={`/tournaments/${tournamentId}/registrations/${info.registration.id}/edit`}
          >
            Edit registration
          </Link>
        </li>
        <li>
          <button
            type="button"
            className={dialog.secondary}
            disabled={Boolean(lock)}
            aria-describedby={lock ? 'session-action-lock' : undefined}
            onClick={() => {
              onMode('move')
            }}
          >
            Move to another {kind}…
          </button>
        </li>
        <li>
          <button
            type="button"
            className={dialog.secondary}
            disabled={Boolean(lock)}
            aria-describedby={lock ? 'session-action-lock' : undefined}
            onClick={() => {
              onMode('remove')
            }}
          >
            Remove from this {kind}…
          </button>
        </li>
      </ul>
      {lock && (
        <p id="session-action-lock" className={dialog.text}>
          Cannot move or remove: {lock}
        </p>
      )}
      <div className={dialog.actions}>
        <button type="button" className={dialog.secondary} onClick={closeDialogOf}>
          Close
        </button>
      </div>
    </>
  )
}

/**
 * What the desk can do to one bowler from a squad's or sweeper's lane page (D-197): edit the whole
 * registration, move the bowler to another session of the same kind (D-202), or remove the bowler
 * (REG-20, D-207). Move and remove are one save of the desk's `PATCH`, which refuses a session with
 * scores or one that is complete (D-10), so the dialog shows the reason and the server has the last word.
 */
export function SessionActionsDialog({
  tournamentId,
  kind,
  sessionId,
  bowler,
  onDone,
  onClose,
}: Readonly<SessionActionsDialogProps>) {
  const info = useEditInfo(tournamentId, bowler.registrationId)
  const squads = useSquads(tournamentId)
  const sweepers = useSweepers(tournamentId)
  const edit = useEditRegistration(tournamentId, bowler.registrationId)
  const [mode, setMode] = useState<Mode>('menu')
  const [failure, setFailure] = useState<string>()

  const sessions: Session[] | undefined = kind === 'squad' ? squads.data : sweepers.data
  const source = sessions?.find((session) => session.id === sessionId)
  const failed = info.error ?? squads.error ?? sweepers.error

  async function save(request: EditRegistrationRequest) {
    setFailure(undefined)
    try {
      await edit.mutateAsync(request)
      onDone(
        mode === 'move'
          ? `${bowler.name} moved to another ${kind}.`
          : `${bowler.name} removed from this ${kind}.`,
      )
      onClose()
    } catch (error) {
      setFailure(messageOf(error))
    }
  }

  let body
  if (failed) {
    body = (
      <>
        <p role="alert" className={dialog.error}>
          {failed.message}
        </p>
        <div className={dialog.actions}>
          <button type="button" className={dialog.secondary} onClick={closeDialogOf}>
            Close
          </button>
        </div>
      </>
    )
  } else if (!info.data || !sessions || !source) {
    body = <Loading label="Loading…" rows={2} />
  } else if (mode === 'menu') {
    body = (
      <Menu
        tournamentId={tournamentId}
        kind={kind}
        source={source}
        info={info.data}
        name={bowler.name}
        onMode={setMode}
      />
    )
  } else {
    const View = mode === 'move' ? MoveView : RemoveView
    body = (
      <View
        kind={kind}
        source={source}
        info={info.data}
        sessions={sessions}
        name={bowler.name}
        pending={edit.isPending}
        failure={failure}
        onSave={(request) => {
          void save(request)
        }}
        onBack={() => {
          setFailure(undefined)
          setMode('menu')
        }}
      />
    )
  }

  return (
    <dialog
      ref={showOnMount}
      className={dialog.dialog}
      aria-label={`Registration actions for ${bowler.name}`}
      onClose={onClose}
    >
      <div className={dialog.content}>{body}</div>
    </dialog>
  )
}
