import { useId, useState } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import styles from '../../shared/Dialog.module.css'
import own from './Payouts.module.css'
import type { SheetOther } from './types'

interface AddBowlerDialogProps {
  /** Bowlers entered in the event who are not on the sheet yet (D-269). */
  others: readonly SheetOther[]
  onAdd: (other: SheetOther) => void
  onClose: () => void
}

/** Whether `name` holds every word of `search`, ignoring case: "be" finds "Tom Becker". */
function matches(name: string, search: string): boolean {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const lower = name.toLowerCase()
  return words.every((word) => lower.includes(word))
}

/**
 * "Add another bowler" (PAY-06, D-269): a search over the bowlers entered in this event who are not
 * listed. Picking one adds a row with its note open and required; this dialog stays open so more can
 * be added, and closes with Close.
 */
export function AddBowlerDialog({ others, onAdd, onClose }: Readonly<AddBowlerDialogProps>) {
  const titleId = useId()
  const inputId = useId()
  const [search, setSearch] = useState('')
  const [open] = useState(() => (node: HTMLDialogElement | null) => {
    showOnMount(node)
  })
  const found = others.filter((other) => matches(other.name, search))

  let result
  if (others.length === 0) {
    result = <p className={styles.text}>Everyone entered in this event is already listed.</p>
  } else if (found.length === 0) {
    result = <p className={styles.text}>No other bowler in this event matches.</p>
  } else {
    result = (
      <ul className={own.list}>
        {found.map((other) => (
          <li key={other.registrationId} className={own.toolbar}>
            <span>
              {other.name} <span className={own.muted}>{other.divisionName}</span>
            </span>
            <button
              type="button"
              className={own.secondary}
              aria-label={`Add ${other.name}`}
              onClick={() => {
                onAdd(other)
              }}
            >
              Add
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <dialog ref={open} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          Add another bowler
        </h2>
        <div className={own.field}>
          <label htmlFor={inputId}>Search by name</label>
          <input
            id={inputId}
            className={own.input}
            value={search}
            autoComplete="off"
            onChange={(event) => {
              setSearch(event.target.value)
            }}
          />
        </div>
        {result}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={closeDialogOf}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  )
}
