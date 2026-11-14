import { useId, useState } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import styles from '../../shared/Dialog.module.css'
import { formatMoney } from '../../shared/formatMoney'
import own from './Payouts.module.css'
import type { PaidChange } from './types'

interface ConfirmPaidDialogProps {
  changes: readonly PaidChange[]
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}

function describe(change: PaidChange): string {
  return change.to === null
    ? `${change.name} (${formatMoney(change.from)}, deleted)`
    : `${change.name} (${formatMoney(change.from)} to ${formatMoney(change.to)})`
}

/**
 * The confirm before a paid payout changes (PAY-12, D-273). The API answered 409 with the paid rows
 * the save would change; the director ticks that the money already went out, and the save is sent
 * again with `confirmPaid`.
 */
export function ConfirmPaidDialog({
  changes,
  pending,
  onConfirm,
  onClose,
}: Readonly<ConfirmPaidDialogProps>) {
  const titleId = useId()
  const [ticked, setTicked] = useState(false)
  const [open] = useState(() => (node: HTMLDialogElement | null) => {
    showOnMount(node)
  })
  return (
    <dialog
      ref={open}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (pending) event.preventDefault()
      }}
      onClose={onClose}
    >
      <form
        className={styles.content}
        onSubmit={(event) => {
          event.preventDefault()
          if (ticked && !pending) onConfirm()
        }}
      >
        <h2 id={titleId} className={styles.title}>
          Change payouts already paid?
        </h2>
        <p className={own.disclaimer}>
          {changes.length === 1
            ? '1 of these payouts is marked paid: '
            : `${changes.length} of these payouts are marked paid: `}
          {changes.map(describe).join('; ')}.
        </p>
        <label className={own.check}>
          <input
            type="checkbox"
            checked={ticked}
            onChange={(event) => {
              setTicked(event.target.checked)
            }}
          />
          <span>I know this was already paid out</span>
        </label>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={pending}
            onClick={closeDialogOf}
          >
            Back
          </button>
          <button type="submit" disabled={!ticked || pending}>
            {pending ? 'Saving…' : 'Save payouts'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
