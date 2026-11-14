import { useId, useRef, useState } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import styles from '../../shared/Dialog.module.css'
import own from './Payouts.module.css'
import { parseAmount } from './amount'
import type { PayoutSource } from './types'
import type { RowState } from './sheetForm'

interface SameAmountDialogProps {
  source: PayoutSource
  /** Who gets the amount: the inferred bowlers, or on the finals the ticked rows (D-270). */
  targets: readonly RowState[]
  onFill: (amount: string) => void
  onClose: () => void
}

/**
 * "Same amount for all" (PAY-08, D-270): one value fills the box of every inferred bowler, and the
 * dialog names them. It only fills boxes; nothing saves until the director presses Save payouts.
 */
export function SameAmountDialog({
  source,
  targets,
  onFill,
  onClose,
}: Readonly<SameAmountDialogProps>) {
  const titleId = useId()
  const inputId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string>()
  const finals = source === 'finals'
  const who = finals ? 'ticked' : 'inferred'
  const [open] = useState(() => (node: HTMLDialogElement | null) => {
    showOnMount(node)
  })

  const fill = () => {
    const parsed = parseAmount(typed)
    if (parsed.kind === 'amount') {
      onFill(typed.trim())
      onClose()
      return
    }
    setError(parsed.kind === 'invalid' ? parsed.message : 'Enter the amount each bowler gets')
    inputRef.current?.focus()
  }

  return (
    <dialog ref={open} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <form
        className={styles.content}
        onSubmit={(event) => {
          event.preventDefault()
          fill()
        }}
      >
        <h2 id={titleId} className={styles.title}>
          Same amount for {finals ? 'ticked rows' : 'all'}
        </h2>
        {targets.length === 0 ? (
          <p className={styles.text}>
            {finals
              ? 'Tick the finalists who get the same amount first.'
              : 'No bowler is inferred to be paid in this event.'}
          </p>
        ) : (
          <>
            <p className={styles.text}>
              {targets.length === 1 ? 'This bowler is' : `These ${targets.length} bowlers are`}{' '}
              {who} to get the amount:
            </p>
            <ul>
              {targets.map((row) => (
                <li key={row.registrationId}>{row.name}</li>
              ))}
            </ul>
            <div className={own.field}>
              <label htmlFor={inputId}>Amount for each ($)</label>
              <input
                ref={inputRef}
                id={inputId}
                className={own.input}
                inputMode="decimal"
                autoComplete="off"
                value={typed}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => {
                  setTyped(event.target.value)
                  setError(undefined)
                }}
              />
              {error && (
                <p id={errorId} className={own.fieldError}>
                  {error}
                </p>
              )}
            </div>
            <p className={own.muted}>Boxes that already hold an amount are replaced.</p>
          </>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={closeDialogOf}>
            Cancel
          </button>
          {targets.length > 0 && (
            <button type="submit">
              Fill {targets.length === 1 ? '1 box' : `${targets.length} boxes`}
            </button>
          )}
        </div>
      </form>
    </dialog>
  )
}
