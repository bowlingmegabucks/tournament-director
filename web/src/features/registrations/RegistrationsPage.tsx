import { useState } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import type { Tournament } from '../tournaments/types'
import { filterRegistrations } from './filter'
import { RegistrationSummary } from './RegistrationSummary'
import { SessionsDialog } from './SessionsDialog'
import styles from './RegistrationsPage.module.css'
import { useRegistrations } from './useRegistrations'

function describeShown(shown: number, total: number, filtering: boolean): string {
  const noun = total === 1 ? 'registration' : 'registrations'
  return filtering ? `Showing ${shown} of ${total} ${noun}.` : `Showing all ${total} ${noun}.`
}

type Kind = 'squads' | 'sweepers'

/** A count that opens the list behind it (REG-28, D-54). A 0 has nothing to open: plain text in the same box. */
function SessionCount({
  count,
  kind,
  onOpen,
}: Readonly<{ count: number; kind: Kind; onOpen: () => void }>) {
  if (count === 0) return <span className={styles.zero}>0</span>
  const singular = kind === 'squads' ? 'squad' : 'sweeper'
  const noun = count === 1 ? singular : `${singular}s`
  return (
    <button
      type="button"
      className={styles.countButton}
      aria-haspopup="dialog"
      aria-label={`${count} ${noun}, show list`}
      onClick={onOpen}
    >
      {count}
    </button>
  )
}

/**
 * The registrations of the tournament in the URL, as a table with a summary and one filter box
 * (REG-23, REG-24, REG-26, D-47, D-49, D-50). Read only. Needs
 * `registrations.read` (D-46, D-52, D-105).
 */
export function RegistrationsPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, isPending, error, refetch } = useRegistrations(id)
  const [filter, setFilter] = useState('')
  // The popup keeps only which registration and which list. Its content is read from the live data
  // at render, so a refetch cannot leave the count and the popup disagreeing.
  const [popup, setPopup] = useState<{ registrationId: string; kind: Kind } | null>(null)

  const registrations = data?.registrations ?? []
  const shown = filterRegistrations(registrations, filter)
  const filtering = filter.trim() !== ''
  const popupRegistration = popup && registrations.find(({ id }) => id === popup.registrationId)

  return (
    <>
      <title>{`Registrations · ${tournament.name} · Tournament Director`}</title>
      <h1>Registrations</h1>
      {isPending && <Loading label="Loading registrations…" rows={6} />}
      {error && (
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )}
      {data && registrations.length === 0 && <p>No registrations yet.</p>}
      {data && registrations.length > 0 && (
        <>
          <RegistrationSummary summary={data.summary} />
          <form
            className={styles.filter}
            role="search"
            aria-label="Filter registrations"
            onSubmit={(event) => {
              event.preventDefault()
            }}
          >
            <div className={styles.field}>
              <label htmlFor="registration-filter">Filter by name or USBC ID</label>
              <input
                id="registration-filter"
                className={styles.input}
                type="search"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value)
                }}
                autoComplete="off"
                aria-describedby="registration-filter-hint"
              />
              <p id="registration-filter-hint" className={styles.note}>
                Type part of a first name, last name, or USBC ID. Several words must all match, such
                as &quot;joe 2045&quot;.
              </p>
            </div>
            <div className={styles.filterBar}>
              <output>{describeShown(shown.length, registrations.length, filtering)}</output>
              <button
                type="button"
                className={styles.secondary}
                disabled={filter === ''}
                onClick={() => {
                  setFilter('')
                }}
              >
                Clear filter
              </button>
            </div>
          </form>
          {shown.length === 0 && <p>No registrations match the filter.</p>}
          {shown.length > 0 && (
            <table className={styles.table}>
              <caption className={styles.hidden}>Registrations in {tournament.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Bowler</th>
                  <th scope="col">USBC ID</th>
                  <th scope="col">Division</th>
                  <th scope="col" className={styles.count}>
                    Squads
                  </th>
                  <th scope="col" className={styles.count}>
                    Sweepers
                  </th>
                  <th scope="col" className={styles.center}>
                    Super sweeper
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((registration) => (
                  <tr key={registration.id}>
                    <th scope="row">{registration.bowler.name}</th>
                    <td data-label="USBC ID">{registration.bowler.usbcId || '–'}</td>
                    <td data-label="Division">{registration.divisionName}</td>
                    <td data-label="Squads" className={styles.count}>
                      <SessionCount
                        count={registration.squadIds.length}
                        kind="squads"
                        onOpen={() => {
                          setPopup({ registrationId: registration.id, kind: 'squads' })
                        }}
                      />
                    </td>
                    <td data-label="Sweepers" className={styles.count}>
                      <SessionCount
                        count={registration.sweeperIds.length}
                        kind="sweepers"
                        onOpen={() => {
                          setPopup({ registrationId: registration.id, kind: 'sweepers' })
                        }}
                      />
                    </td>
                    {registration.superSweeper ? (
                      <td data-label="Super sweeper" className={styles.center}>
                        <span aria-hidden="true">✓</span>
                        <span className={styles.hidden}>Yes</span>
                      </td>
                    ) : (
                      // Stryker disable next-line StringLiteral: the class only hides a blank cell on narrow screens; e2e checks it at 320px.
                      <td data-label="Super sweeper" className={`${styles.center} ${styles.no}`}>
                        <span className={styles.hidden}>No</span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {popup && popupRegistration && (
            <SessionsDialog
              bowlerName={popupRegistration.bowler.name}
              kind={popup.kind}
              all={data.summary[popup.kind]}
              entered={
                popup.kind === 'squads' ? popupRegistration.squadIds : popupRegistration.sweeperIds
              }
              onClose={() => {
                setPopup(null)
              }}
            />
          )}
        </>
      )}
    </>
  )
}
