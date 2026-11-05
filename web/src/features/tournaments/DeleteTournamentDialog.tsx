import { useCallback, useId, useRef, useState } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import styles from '../../shared/Dialog.module.css'
import own from './DeleteTournament.module.css'
import { nameMatches } from './nameMatches'

interface DeleteTournamentDialogProps {
  tournamentName: string
  /** What the API said will go, once it asked the director to confirm (D-134). */
  warning?: string
  pending: boolean
  /** Why the request did not go through, when it did not. */
  failure?: string
  onConfirm: () => void
  onClose: () => void
}

/**
 * The delete confirmation (TRN-36, D-136). The admin types the tournament's name before Delete
 * turns on. Cancel has focus first, so Enter on a fresh dialog is the safe choice. When the API
 * asks to confirm, the text becomes the list of what goes, and the typed name stays valid.
 */
export function DeleteTournamentDialog({
  tournamentName,
  warning,
  pending,
  failure,
  onConfirm,
  onClose,
}: Readonly<DeleteTournamentDialogProps>) {
  const titleId = useId()
  const inputId = useId()
  const hintId = useId()
  const [typed, setTyped] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  // Stable, so it runs when the dialog mounts and never steals focus from the box on a re-render.
  const open = useCallback((node: HTMLDialogElement | null) => {
    showOnMount(node)
    if (node) cancelRef.current?.focus()
  }, [])
  const matches = nameMatches(typed, tournamentName)

  return (
    <dialog ref={open} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <form
        className={styles.content}
        onSubmit={(event) => {
          event.preventDefault()
          if (matches && !pending) onConfirm()
        }}
      >
        <h2 id={titleId} className={styles.title}>
          Delete this tournament?
        </h2>
        {warning === undefined ? (
          <>
            <p className={styles.text}>
              This deletes <strong>{tournamentName}</strong> for good. It cannot be undone.
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
        ) : (
          <>
            <p className={styles.text}>{warning}</p>
            <p className={styles.text}>This cannot be undone.</p>
          </>
        )}
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
          <button type="submit" className={own.destructive} disabled={!matches || pending}>
            {pending ? 'Deleting…' : warning === undefined ? 'Delete tournament' : 'Delete anyway'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
