import { useId, useState } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import dialog from '../../shared/Dialog.module.css'
import { LeaveDialog } from '../../shared/LeaveDialog'
import { Loading } from '../../shared/Loading'
import { formatSessionDate } from '../../shared/sessionFormat'
import { useLeaveGuard } from '../../shared/useLeaveGuard'
import { useRegistrations } from '../registrations/useRegistrations'
import { useSquads } from '../squads/useSquads'
import { NoShowChangedError, type NoShowTarget } from './api'
import { describeAtLarge, describeChange, describePayout } from './describe'
import styles from './NoShowDialog.module.css'
import type { Choice, EntryKey, Preview } from './types'
import { useApplyNoShow, useNoShowPreview } from './useNoShow'

type Action = Choice['action']

interface NoShowDialogProps {
  target: NoShowTarget
  bowlerName: string
  /** Called after a save, with the sentence for the toast. */
  onDone: (message: string) => void
  onClose: () => void
}

const keyOf = ({ squadId, registrationId }: EntryKey) => `${squadId}:${registrationId}`

function choiceOf(
  action: Action | undefined,
  targetSquadId: string,
  keepAdvancing: EntryKey[],
): Choice | undefined {
  if (action === 'refund') return { action, keepAdvancing }
  if (action === 'move' && targetSquadId !== '') return { action, targetSquadId, keepAdvancing }
  return undefined
}

interface Line {
  key: string
  text: string
}

function PreviewList({ title, lines }: Readonly<{ title: string; lines: Line[] }>) {
  if (lines.length === 0) return null
  return (
    <div>
      <h3 className={styles.heading}>{title}</h3>
      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line.key}>{line.text}</li>
        ))}
      </ul>
    </div>
  )
}

interface ReviewProps {
  preview: Preview
  kept: EntryKey[]
  onKeep: (key: EntryKey, keep: boolean) => void
}

/** What the change does (NSH-09), with the "Keep advancing" boxes (NSH-20). */
function Review({ preview, kept, onKeep }: Readonly<ReviewProps>) {
  const nothing =
    preview.warnings.length +
      preview.changes.length +
      preview.keepAdvancing.length +
      preview.atLarge.length +
      preview.payouts.length ===
    0
  const ticked = new Set(kept.map(keyOf))
  return (
    <>
      {preview.warnings.map((warning) => (
        <p key={warning} className={styles.warning}>
          {warning}
        </p>
      ))}
      {preview.keepAdvancing.length > 0 && (
        <fieldset className={styles.group}>
          <legend>Keep advancing</legend>
          <p className={dialog.text}>
            Tick a bowler to have them advance by ruling. This cannot be undone.
          </p>
          {preview.keepAdvancing.map((choice) => (
            <label key={keyOf(choice)} className={styles.choice}>
              <input
                type="checkbox"
                checked={ticked.has(keyOf(choice))}
                onChange={(event) => {
                  onKeep(
                    { squadId: choice.squadId, registrationId: choice.registrationId },
                    event.target.checked,
                  )
                }}
              />
              <span>
                {choice.name} ({choice.divisionName}, {formatSessionDate(choice.squadDate)})
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <PreviewList
        title="Squad results"
        lines={preview.changes.map((change) => ({
          key: `${keyOf(change)}:${change.change}`,
          text: describeChange(change),
        }))}
      />
      <PreviewList
        title="At-large"
        lines={preview.atLarge.map((change) => ({
          key: change.divisionId,
          text: describeAtLarge(change),
        }))}
      />
      <PreviewList
        title="Payouts"
        lines={preview.payouts.map((payout) => ({
          key: payout.payoutId,
          text: describePayout(payout),
        }))}
      />
      {nothing && <p className={dialog.text}>No one’s results or payouts change.</p>}
      {preview.action === 'move' && (
        <p className={dialog.text}>
          The new squad has not been bowled, so at-large figures can change again.
        </p>
      )}
    </>
  )
}

function doneText(name: string, preview: Preview): string {
  if (preview.target) return `${name} moved to ${formatSessionDate(preview.target.date)}.`
  return preview.deletesRegistration
    ? `${name} refunded. The registration is deleted.`
    : `${name} refunded from this squad.`
}

/**
 * Move or refund a no-show after the squad is complete (NSH-01 to NSH-13), admin only. Nothing is
 * saved until the admin has seen what changes and confirmed it.
 */
export function NoShowDialog({ target, bowlerName, onDone, onClose }: Readonly<NoShowDialogProps>) {
  const titleId = useId()
  const targetId = useId()
  const squads = useSquads(target.tournamentId)
  const registrations = useRegistrations(target.tournamentId)
  const [action, setAction] = useState<Action>()
  const [targetSquadId, setTargetSquadId] = useState('')
  const [kept, setKept] = useState<EntryKey[]>([])
  const choice = choiceOf(action, targetSquadId, kept)
  const preview = useNoShowPreview(target, choice)
  const apply = useApplyNoShow(target)
  // Leaving the page loses the choice, so ask first once one is made.
  const guard = useLeaveGuard(action !== undefined)

  const held = new Set(
    registrations.data?.registrations.find((entry) => entry.id === target.registrationId)?.squadIds,
  )
  const open = (squads.data ?? []).filter(
    (squad) => !squad.complete && squad.id !== target.squadId && !held.has(squad.id),
  )
  const failed = squads.error ?? registrations.error

  /** A different action or squad starts the review again, with no boxes ticked. */
  function restart() {
    setKept([])
    apply.reset()
  }

  async function confirm() {
    if (!choice || !preview.data) return
    try {
      const { version } = preview.data
      await guard.whileSaving(() => apply.mutateAsync({ choice, version }))
      onDone(doneText(bowlerName, preview.data))
      onClose()
    } catch {
      // The mutation holds the error, and the dialog shows it.
    }
  }

  let confirmLabel = action === 'refund' ? 'Refund entry' : 'Move entry'
  if (apply.isPending) confirmLabel = 'Saving…'

  const problem = failed ?? preview.error ?? apply.error
  const ready = choice !== undefined && preview.data !== undefined && !preview.isPlaceholderData

  let body
  if (!squads.data || !registrations.data) {
    body = failed ? null : <Loading label="Loading…" rows={2} />
  } else {
    body = (
      <>
        <fieldset className={styles.group}>
          <legend>What happens to this entry?</legend>
          {(['move', 'refund'] as const).map((value) => (
            <label key={value} className={styles.choice}>
              <input
                type="radio"
                name="no-show-action"
                checked={action === value}
                onChange={() => {
                  setAction(value)
                  restart()
                }}
              />
              <span>{value === 'move' ? 'Move to another squad' : 'Refund'}</span>
            </label>
          ))}
        </fieldset>
        {action === 'move' &&
          (open.length === 0 ? (
            <p className={dialog.text}>There is no open squad to move to.</p>
          ) : (
            <div className={styles.field}>
              <label htmlFor={targetId}>New squad</label>
              <select
                id={targetId}
                value={targetSquadId}
                onChange={(event) => {
                  setTargetSquadId(event.target.value)
                  restart()
                }}
              >
                <option value="">Choose a squad</option>
                {open.map((squad) => (
                  <option key={squad.id} value={squad.id}>
                    {formatSessionDate(squad.date)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        {choice && preview.isFetching && <Loading label="Checking what changes…" />}
        {choice && preview.data && (
          <Review
            preview={preview.data}
            kept={kept}
            onKeep={(key, keep) => {
              apply.reset()
              setKept((current) => [
                ...current.filter((other) => keyOf(other) !== keyOf(key)),
                ...(keep ? [key] : []),
              ])
            }}
          />
        )}
      </>
    )
  }

  return (
    <>
      <dialog
        ref={showOnMount}
        className={`${dialog.dialog} ${styles.sheet}`}
        aria-labelledby={titleId}
        onClose={onClose}
        onCancel={(event) => {
          // Escape must not hide a save that is still running.
          if (apply.isPending) event.preventDefault()
        }}
      >
        <div className={dialog.content}>
          <h2 id={titleId} className={dialog.title}>
            Move or refund {bowlerName}
          </h2>
          {body}
          {problem && (
            <p role="alert" className={dialog.error}>
              {problem instanceof NoShowChangedError
                ? 'This changed since you reviewed it. Check it again, then confirm.'
                : problem.message}
            </p>
          )}
          <div className={dialog.actions}>
            <button
              type="button"
              className={dialog.secondary}
              disabled={apply.isPending}
              onClick={closeDialogOf}
            >
              Cancel
            </button>
            <button
              type="button"
              className={dialog.destructive}
              disabled={!ready || apply.isPending || preview.error !== null}
              onClick={() => {
                void confirm()
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
      <LeaveDialog blocker={guard.blocker} />
    </>
  )
}
