import { useId } from 'react'
import { useSearchParams } from 'react-router'
import styles from './ResultsPage.module.css'

export interface ChooserDivision {
  id: string
  name: string
  entries: number
}

/**
 * The "Division" list of a results page (D-80, D-89). It shows only when there is more than one
 * division, lists each with its entry count, and keeps the choice in the address (`?division=`)
 * so a reload or a shared link opens the same one.
 */
export function DivisionChooser({
  divisions,
  chosenId,
}: Readonly<{ divisions: readonly ChooserDivision[]; chosenId: string }>) {
  const selectId = useId()
  const [, setSearch] = useSearchParams()
  if (divisions.length < 2) return null

  return (
    <div className={styles.field}>
      <label htmlFor={selectId}>Division</label>
      <select
        id={selectId}
        value={chosenId}
        onChange={(event) => {
          setSearch(
            (previous) => {
              const next = new URLSearchParams(previous)
              next.set('division', event.target.value)
              return next
            },
            // Stryker disable next-line ObjectLiteral,BooleanLiteral: the history is the browser's; e2e checks the Back button.
            { replace: true },
          )
        }}
      >
        {divisions.map((division) => (
          <option key={division.id} value={division.id}>
            {division.name} ({division.entries} {division.entries === 1 ? 'entry' : 'entries'})
          </option>
        ))}
      </select>
    </div>
  )
}
