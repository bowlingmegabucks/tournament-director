import { useId, useRef, useState } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import styles from '../../shared/Dialog.module.css'
import { Loading } from '../../shared/Loading'
import { completeLines, payoutNotes, type TournamentCompleteInfo } from './completeApi'
import own from './DeleteTournament.module.css'
import { nameMatches } from './nameMatches'

interface CompleteTournamentDialogProps {
  tournamentName: string
  /** What the complete will do. Undefined while it loads or when it could not be read. */
  info: TournamentCompleteInfo | undefined
  loading: boolean
  /** Why the counts did not load. The director never confirms blind (D-259). */
  loadFailure?: string
  pending: boolean
  /** Why the request did not go through, when it did not. */
  failure?: string
  onConfirm: () => void
  onRetry: () => void
  onClose: () => void
}

/**
 * The complete confirmation (TRN-43, D-130, D-259). It says what will be saved before the director
 * presses Complete, since nothing undoes it, and asks for the tournament name (as delete does,
 * D-136). Cancel has focus first, so Enter on a fresh dialog is the safe choice. Without the counts
 * there is no Complete button.
 */
export function CompleteTournamentDialog({
  tournamentName,
  info,
  loading,
  loadFailure,
  pending,
  failure,
  onConfirm,
  onRetry,
  onClose,
}: Readonly<CompleteTournamentDialogProps>) {
  const titleId = useId()
  const inputId = useId()
  const hintId = useId()
  const [typed, setTyped] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  // A function made once, so React runs it when the dialog mounts and never again: a new function
  // on each render would take focus back from the box while the director types.
  const [open] = useState(() => (node: HTMLDialogElement | null) => {
    showOnMount(node)
    // Stryker disable next-line ConditionalExpression: on unmount the ref is already null, so the focus call does nothing.
    if (node) cancelRef.current?.focus()
  })
  const matches = nameMatches(typed, tournamentName)
  const lines = info === undefined ? [] : completeLines(info)
  const notes = info === undefined ? [] : payoutNotes(info)

  let body
  if (loading) {
    body = (
      <p className={styles.text}>
        <Loading label="Loading what this will do…" />
      </p>
    )
  } else if (info === undefined) {
    body = (
      <p role="alert" className={styles.error}>
        {loadFailure ?? 'Could not load what this will do.'}
      </p>
    )
  } else {
    body = (
      <>
        {lines.length > 0 ? (
          <>
            <p className={styles.text}>This will:</p>
            <ul className={own.reasons}>
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className={styles.text}>
            Every squad and sweeper is already complete, so no scores will be saved.
          </p>
        )}
        {notes.length > 0 && (
          <>
            <p className={styles.text}>Before you complete:</p>
            <ul className={own.reasons}>
              {notes.map((note) => (
                <li key={note}>
                  <strong>{note}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={styles.text}>
          This cannot be undone. The tournament and everything in it will be locked, payouts
          included.
        </p>
        <div className={own.field}>
          <label className={own.label} htmlFor={inputId}>
            Type the tournament name to confirm
          </label>
          <input
            id={inputId}
            className={own.input}
            value={typed}
            autoComplete="off"
            aria-describedby={hintId}
            onChange={(event) => {
              setTyped(event.target.value)
            }}
          />
          <p id={hintId} className={own.hint}>
            {tournamentName}
          </p>
        </div>
      </>
    )
  }

  const ready = info !== undefined

  return (
    <dialog
      ref={open}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape must not close the dialog while the request runs: its outcome would go unseen.
        if (pending) event.preventDefault()
      }}
      onClose={onClose}
    >
      <form
        className={styles.content}
        onSubmit={(event) => {
          event.preventDefault()
          if (ready && matches && !pending) onConfirm()
        }}
      >
        <h2 id={titleId} className={styles.title}>
          Complete this tournament?
        </h2>
        {body}
        {failure && (
          <p role="alert" className={styles.error}>
            {failure}
          </p>
        )}
        <div className={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.secondary}
            disabled={pending}
            onClick={closeDialogOf}
          >
            Cancel
          </button>
          {!loading && info === undefined ? (
            <button type="button" className={styles.secondary} onClick={onRetry}>
              Try again
            </button>
          ) : (
            <button
              type="submit"
              className={styles.destructive}
              disabled={!ready || !matches || pending}
            >
              {pending ? 'Completing…' : 'Complete tournament'}
            </button>
          )}
        </div>
      </form>
    </dialog>
  )
}
