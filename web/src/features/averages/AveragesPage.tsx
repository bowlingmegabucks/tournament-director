import { useCallback, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { AverageMarker } from '../../shared/AverageMarker'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { useCan } from '../auth/useCan'
import { AdjustDialog } from './AdjustDialog'
import { AverageDetailsDialog } from './AverageDetailsDialog'
import { AverageConfirmError } from './api'
import styles from './Averages.module.css'
import { ConfirmAverageDialog } from './ConfirmAverageDialog'
import { filterAverages, type AverageFilter } from './filter'
import type { AverageRow } from './types'
import { useAverages, useRemoveCheck, useSaveCheck } from './useAverages'

/** What is open over the page: the adjust form, a row's details, or a confirm of a change. */
type Overlay =
  | { kind: 'adjust'; row: AverageRow }
  | { kind: 'details'; row: AverageRow }
  | { kind: 'confirm'; row: AverageRow; message: string; remove: boolean }

function StatusCell({ row, onDetails }: Readonly<{ row: AverageRow; onDetails: () => void }>) {
  if (row.status === 'verified') {
    return (
      <>
        <span className={styles.ok} aria-hidden="true">
          ✓
        </span>{' '}
        Verified
      </>
    )
  }
  if (row.status === 'adjusted') {
    return (
      <>
        Adjusted{' '}
        <button type="button" className={styles.link} onClick={onDetails}>
          Details
        </button>
      </>
    )
  }
  return <AverageMarker label={row.providedAverage === null ? 'No average' : 'Not verified'} />
}

/**
 * The registrations of handicap divisions, so a director can check each bowler's average before
 * handicap counts on it (AVG-02 to AVG-07, AVG-15, D-295). Verify and Adjust need
 * `averages.verify`; a complete tournament is read only (D-294). The filter is in the address
 * (`?show=all`).
 */
export function AveragesPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const filter: AverageFilter = params.get('show') === 'all' ? 'all' : 'unverified'
  const { data, isPending, error, refetch } = useAverages(id)
  const canVerify = useCan('averages.verify')
  const save = useSaveCheck(id)
  const remove = useRemoveCheck(id)
  const [text, setText] = useState('')
  const [overlay, setOverlay] = useState<Overlay>()
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string }>()
  const dismiss = useCallback(() => {
    setNotice(undefined)
  }, [])
  const closeOverlay = useCallback(() => {
    setOverlay(undefined)
  }, [])

  if (isPending) {
    return (
      <>
        <h1>Averages</h1>
        <Loading label="Loading averages…" rows={4} />
      </>
    )
  }
  if (error) {
    if (error instanceof TournamentNotFoundError) return <p>This tournament does not exist.</p>
    return (
      <QueryError
        error={error}
        onRetry={() => {
          void refetch()
        }}
      />
    )
  }

  const editable = canVerify && !data.tournamentComplete
  const unverified = data.rows.filter((row) => row.status === 'unverified').length
  const shown = filterAverages(data.rows, filter, text)

  const succeeded = (name: string, what: string) => {
    setOverlay(undefined)
    setNotice({ kind: 'success', text: `${what} for ${name}.` })
  }
  const failed = (error: Error, row: AverageRow, removing: boolean) => {
    if (error instanceof AverageConfirmError) {
      setOverlay({ kind: 'confirm', row, message: error.message, remove: removing })
      return
    }
    setOverlay(undefined)
    setNotice({ kind: 'error', text: error.message })
  }
  const verify = (row: AverageRow, confirm: boolean) => {
    save.mutate(
      { registrationId: row.registrationId, change: { action: 'verify' }, confirm },
      {
        onSuccess: () => {
          succeeded(row.bowlerName, 'Average verified')
        },
        onError: (err) => {
          failed(err, row, false)
        },
      },
    )
  }
  const removeCheck = (row: AverageRow, confirm: boolean) => {
    remove.mutate(
      { registrationId: row.registrationId, confirm },
      {
        onSuccess: () => {
          succeeded(row.bowlerName, 'Check removed')
        },
        onError: (err) => {
          failed(err, row, true)
        },
      },
    )
  }
  const pending = save.isPending || remove.isPending

  return (
    <>
      <title>Averages · Tournament Director</title>
      <h1>Averages</h1>
      {notice && (
        <Toast
          kind={notice.kind}
          onDismiss={dismiss}
          autoDismissMs={notice.kind === 'success' ? 4000 : undefined}
        >
          {notice.text}
        </Toast>
      )}
      {data.tournamentComplete && (
        <p className={styles.notice}>This tournament is complete. Averages cannot change.</p>
      )}
      <p className={styles.hint}>
        Check each bowler&apos;s average before handicap counts on it. Showing {shown.length} of{' '}
        {data.rows.length} {data.rows.length === 1 ? 'registration' : 'registrations'} in handicap
        divisions.
      </p>
      <div className={styles.toolbar}>
        <div className={styles.seg} role="group" aria-label="Show">
          <button
            type="button"
            aria-pressed={filter === 'unverified'}
            onClick={() => {
              setParams({}, { replace: true })
            }}
          >
            Unverified ({unverified})
          </button>
          <button
            type="button"
            aria-pressed={filter === 'all'}
            onClick={() => {
              setParams({ show: 'all' }, { replace: true })
            }}
          >
            All ({data.rows.length})
          </button>
        </div>
        <label className={styles.field}>
          <span>Find a bowler</span>
          <input
            className={styles.input}
            type="search"
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
            }}
          />
        </label>
      </div>
      {data.rows.length === 0 ? (
        <p>This tournament has no handicap divisions, so there are no averages to check.</p>
      ) : shown.length === 0 && filter === 'unverified' && text.trim() === '' ? (
        <p>Every handicap bowler has a checked average. Choose All to review them.</p>
      ) : shown.length === 0 ? (
        <p>No bowler matches.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Bowler</th>
              <th scope="col">Division</th>
              <th scope="col">USBC ID</th>
              <th scope="col" className={styles.num}>
                Provided
              </th>
              <th scope="col" className={styles.num}>
                In use
              </th>
              <th scope="col">Status</th>
              {editable && <th scope="col">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.registrationId}>
                <th scope="row" data-label="Bowler">
                  {row.bowlerName}
                </th>
                <td data-label="Division">{row.divisionName}</td>
                <td data-label="USBC ID">{row.usbcId}</td>
                <td data-label="Provided" className={styles.num}>
                  {row.providedAverage ?? '—'}
                </td>
                <td data-label="In use" className={styles.num}>
                  {row.status === 'adjusted' ? (
                    <span className={styles.adjusted}>{row.averageInUse}</span>
                  ) : (
                    (row.averageInUse ?? '—')
                  )}
                </td>
                <td data-label="Status">
                  <StatusCell
                    row={row}
                    onDetails={() => {
                      setOverlay({ kind: 'details', row })
                    }}
                  />
                </td>
                {editable && (
                  <td data-label="Actions">
                    <div className={styles.actions}>
                      {row.status === 'unverified' && row.providedAverage !== null && (
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={`Verify ${row.bowlerName}`}
                          onClick={() => {
                            verify(row, false)
                          }}
                        >
                          Verify
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={pending}
                        aria-label={`Adjust ${row.bowlerName}`}
                        onClick={() => {
                          setOverlay({ kind: 'adjust', row })
                        }}
                      >
                        Adjust
                      </button>
                      {row.status !== 'unverified' && (
                        <button
                          type="button"
                          className={styles.link}
                          disabled={pending}
                          aria-label={`Remove check for ${row.bowlerName}`}
                          onClick={() => {
                            removeCheck(row, false)
                          }}
                        >
                          Remove check
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {overlay?.kind === 'adjust' && (
        <AdjustDialog
          tournamentId={id}
          row={overlay.row}
          onClose={closeOverlay}
          onSaved={(row) => {
            setNotice({ kind: 'success', text: `Average adjusted for ${row.bowlerName}.` })
          }}
        />
      )}
      {overlay?.kind === 'details' && (
        <AverageDetailsDialog row={overlay.row} onClose={closeOverlay} />
      )}
      {overlay?.kind === 'confirm' && (
        <ConfirmAverageDialog
          message={overlay.message}
          pending={pending}
          onClose={closeOverlay}
          onConfirm={() => {
            if (overlay.remove) removeCheck(overlay.row, true)
            else verify(overlay.row, true)
          }}
        />
      )}
    </>
  )
}
