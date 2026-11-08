import { useId } from 'react'
import { closeDialogOf, showOnMount } from './dialogParts'
import styles from './Dialog.module.css'
import { Loading } from './Loading'
import type { SessionCompleteInfo } from './sessionCompleteApi'
import { word, type SessionKind } from './sessionEditApi'

interface CompleteSessionDialogProps {
  kind: SessionKind
  /** The session's date, formatted: it names the session in the text. */
  dateLabel: string
  /** What the complete will do. Undefined while it loads, or when it could not be read. */
  info: SessionCompleteInfo | undefined
  /** The read is still going: Complete waits (D-194). */
  loading: boolean
  pending: boolean
  /** Why the request did not go through, when it did not. */
  failure?: string
  onConfirm: () => void
  onClose: () => void
}

/** "1 bowler is" / "12 bowlers are". */
const entered = (count: number) => (count === 1 ? '1 bowler is' : `${count} bowlers are`)

/** "1 has" / "3 have". */
const have = (count: number) => (count === 1 ? '1 has' : `${count} have`)

/** "1 game" / "3 games". */
const gamesOf = (count: number) => (count === 1 ? '1 game' : `${count} games`)

/** What a squad's complete will save and leave, one line each, as in the mockup (D-194). */
function SquadLines({ info }: Readonly<{ info: SessionCompleteInfo }>) {
  const noScore = info.noScoreCount ?? 0
  const partial = info.partialCount ?? 0
  const games = info.games ?? 0
  if (noScore === 0 && partial === 0) {
    return <p className={styles.text}>All have scores, so no zeros are saved.</p>
  }
  return (
    <ul>
      {noScore > 0 && (
        <li>
          {have(noScore)} no scores and will get 0 for each of {gamesOf(games)}.
        </li>
      )}
      {partial > 0 && (
        <li>
          {have(partial)} fewer than {gamesOf(games)} and stays as entered.
        </li>
      )}
    </ul>
  )
}

/**
 * The complete confirmation for a squad or a sweeper (SQD-15, SQD-16, D-194). It says what will be
 * saved before the director presses Complete, since nothing undoes it (SQD-18). Cancel has focus
 * first, so Enter on a fresh dialog is the safe choice. If the counts could not be read the dialog
 * still works with a plain sentence: the API decides.
 */
export function CompleteSessionDialog({
  kind,
  dateLabel,
  info,
  loading,
  pending,
  failure,
  onConfirm,
  onClose,
}: Readonly<CompleteSessionDialogProps>) {
  const titleId = useId()
  const name = word(kind)
  const count = info?.entryCount ?? 0

  let body
  if (loading) {
    body = (
      <p className={styles.text}>
        <strong>{dateLabel}</strong>
        <Loading label="Loading…" />
      </p>
    )
  } else if (info === undefined) {
    body = (
      <p className={styles.text}>
        <strong>{dateLabel}</strong> will be completed.
        {kind === 'squads' && ' Bowlers with no scores get 0 for each game.'} This cannot be undone.
      </p>
    )
  } else {
    body = (
      <>
        <p className={styles.text}>
          <strong>{dateLabel}</strong>:{' '}
          {count === 0 ? 'no bowlers are entered.' : `${entered(count)} entered.`}
          {kind === 'sweepers' && count > 0 && ' No scores are filled in.'}
        </p>
        {kind === 'squads' && count > 0 && <SquadLines info={info} />}
        <p className={styles.text}>This cannot be undone.</p>
      </>
    )
  }

  return (
    <dialog
      ref={showOnMount}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape must not close the dialog while the request runs: its outcome would go unseen.
        if (pending) event.preventDefault()
      }}
      onClose={onClose}
    >
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          Complete this {name}?
        </h2>
        {body}
        {failure && (
          <p role="alert" className={styles.error}>
            {failure}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={pending}
            onClick={closeDialogOf}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.destructive}
            disabled={loading || pending}
            onClick={onConfirm}
          >
            {pending ? 'Completing…' : `Complete ${name}`}
          </button>
        </div>
      </div>
    </dialog>
  )
}
