import { useState, type SubmitEvent } from 'react'
import { Loading } from '../../shared/Loading'
import { NoSearchFieldError, type BowlerFilter } from './bowlerApi'
import type { BowlerSearchResult } from './types'
import { useBowlerSearch } from './useBowlerSearch'
import styles from './AddRegistration.module.css'

const none: BowlerFilter = { lastName: '', firstName: '', email: '', usbcId: '' }

interface BowlerSearchProps {
  tournamentId: string
  onPick: (bowler: BowlerSearchResult) => void
  onNew: () => void
}

/**
 * Find a bowler before registering one (BWL-14, D-157): last and first name start, email, and USBC
 * ID. A bowler already in this tournament carries a badge with their division (D-159). The app does
 * not match names (D-161): two Marias look alike here, and the desk reads the USBC ID and town.
 */
export function BowlerSearch({ tournamentId, onPick, onNew }: Readonly<BowlerSearchProps>) {
  const [draft, setDraft] = useState<BowlerFilter>(none)
  const [submitted, setSubmitted] = useState<BowlerFilter | null>(null)
  const [needField, setNeedField] = useState(false)
  const search = useBowlerSearch(tournamentId, submitted)

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (Object.values(draft).every((value) => value.trim() === '')) {
      setNeedField(true)
      return
    }
    setNeedField(false)
    setSubmitted({ ...draft })
  }

  const box = (key: keyof BowlerFilter, label: string, type: 'text' | 'email' = 'text') => (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={`search-${key}`}>
        {label}
      </label>
      <input
        id={`search-${key}`}
        className={styles.input}
        type={type}
        autoComplete="off"
        value={draft[key]}
        onChange={(event) => {
          setDraft({ ...draft, [key]: event.target.value })
        }}
      />
    </div>
  )

  const data = search.data
  return (
    <div className={styles.stack}>
      <form className={styles.group} onSubmit={submit} aria-label="Find a bowler" noValidate>
        <div className={styles.pair}>
          {box('lastName', 'Last name starts with')}
          {box('firstName', 'First name starts with')}
        </div>
        <div className={styles.pair}>
          {box('email', 'Email', 'email')}
          {box('usbcId', 'USBC ID')}
        </div>
        {needField && (
          <p className={styles.fieldError} role="alert">
            Enter at least one search field.
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit">Search</button>
          <button type="button" className={styles.secondary} onClick={onNew}>
            New bowler
          </button>
        </div>
      </form>

      {submitted && search.isPending && <Loading label="Searching…" rows={3} />}
      {search.error && !(search.error instanceof NoSearchFieldError) && (
        <div role="alert" className={styles.summary}>
          <p>
            <strong>Could not search for bowlers.</strong> {search.error.message}
          </p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              void search.refetch()
            }}
          >
            Try again
          </button>
        </div>
      )}
      {data && data.bowlers.length === 0 && (
        <p>
          No bowler matches. Check the spelling, search by USBC ID or email, or choose{' '}
          <strong>New bowler</strong>.
        </p>
      )}
      {data && data.bowlers.length > 0 && (
        <section aria-label="Search results">
          <h2>
            {data.bowlers.length} {data.bowlers.length === 1 ? 'bowler' : 'bowlers'} found
          </h2>
          <ul className={styles.results}>
            {data.bowlers.map((bowler) => (
              <li key={bowler.id} className={styles.result}>
                <span>
                  <strong>{bowler.name}</strong>
                  <br />
                  <span className={styles.hint}>
                    {bowler.usbcId === '' ? 'No USBC ID' : bowler.usbcId}
                    {bowler.city !== '' &&
                      ` · ${bowler.city}${bowler.state ? `, ${bowler.state}` : ''}`}
                  </span>
                </span>
                <span className={styles.resultActions}>
                  {bowler.registered && (
                    <span className={`${styles.badge} ${styles.registered}`}>
                      ✓ Registered: {bowler.registered.divisionName}
                    </span>
                  )}
                  <button
                    type="button"
                    className={styles.secondary}
                    aria-label={`Pick ${bowler.name}${bowler.usbcId === '' ? '' : `, ${bowler.usbcId}`}`}
                    onClick={() => {
                      onPick(bowler)
                    }}
                  >
                    Pick
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {data.more && (
            <p className={styles.notice}>
              Showing the first 25. Add a first name, email, or USBC ID to narrow the list.
            </p>
          )}
          <p className={styles.hint}>
            Records can look alike. Check the USBC ID and town before you pick. The app does not
            match names for you.
          </p>
        </section>
      )}
    </div>
  )
}
