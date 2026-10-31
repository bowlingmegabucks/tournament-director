import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatSessionDate } from '../../shared/sessionFormat'
import type { SessionKind } from '../../shared/session'
import { filterSheets } from './filter'
import { imagesReady, startPrint } from '../../shared/print'
import { PrintSheets } from './PrintSheets'
import styles from './RecapDialog.module.css'
import { RecapSheet } from './RecapSheet'
import type { RecapSheet as Sheet, SkipPattern } from './types'
import { useRecapSheets } from './useRecapSheets'

interface RecapDialogProps {
  kind: SessionKind
  tournamentId: string
  sessionId: string
  onClose: () => void
}

// A native modal <dialog> traps focus, closes on Escape, and gives focus back to the button that
// opened it. The ref callback opens it once it is on the page.
function showOnMount(node: HTMLDialogElement | null) {
  if (node && !node.open) node.showModal()
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

/**
 * The recap sheet preview and print (RPT-09, D-62, D-64): a modal over the lane page with every
 * sheet in a scrolling list, a checkbox on each, the skip pattern, and Print all or Print
 * selected. The lanes on a sheet come from every bowler with a lane, so what is checked only
 * decides which sheets print and never changes a lane (D-64).
 */
export function RecapDialog({
  kind,
  tournamentId,
  sessionId,
  onClose,
}: Readonly<RecapDialogProps>) {
  const titleId = useId()
  const filterId = useId()
  const { data, error, isPending, refetch } = useRecapSheets(kind, tournamentId, sessionId)
  const [pattern, setPattern] = useState<SkipPattern>('staggered')
  // Who is NOT checked, so every sheet starts checked, and a refetch adds no surprises.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [printing, setPrinting] = useState<readonly Sheet[]>()
  // Where the last mouse press landed, so a drag that ends on the backdrop does not close it.
  const pressedOnBackdrop = useRef(false)
  // Ends the print in progress, if any. One print at a time: a second click waits for the first.
  const endPrint = useRef<() => void>(undefined)
  const preparing = useRef(false)

  // Closing the dialog while the browser prints must not leave the page marked for print.
  useEffect(
    () => () => {
      endPrint.current?.()
    },
    [],
  )

  const sheets = data?.sheets ?? []
  const shown = filterSheets(sheets, filter)
  const selected = sheets.filter((sheet) => !unchecked.has(sheet.registrationId))

  async function print(list: readonly Sheet[]) {
    if (preparing.current || endPrint.current) return
    preparing.current = true
    // Put the print copy on the page and let its images load, then ask the browser to print it.
    flushSync(() => {
      setPrinting(list)
    })
    await imagesReady('recap')
    preparing.current = false
    endPrint.current = startPrint('recap', () => {
      endPrint.current = undefined
      setPrinting(undefined)
    })
  }

  function check(ids: readonly string[], on: boolean) {
    setUnchecked((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  let body
  if (isPending) {
    body = <Loading label="Loading recap sheets…" rows={2} />
  } else if (error) {
    body = (
      <QueryError
        error={error}
        onRetry={() => {
          void refetch()
        }}
      />
    )
  } else if (sheets.length === 0) {
    body = (
      <p className={styles.empty}>
        No bowler has a lane yet, so there are no recap sheets. Assign lanes first, then print.
      </p>
    )
  } else {
    body = (
      <>
        <section className={styles.notice} aria-label="About these sheets">
          <p className={styles.noticeText}>
            The lanes on every sheet come from all {sheets.length}{' '}
            {plural(sheets.length, 'bowler', 'bowlers')} with a lane, whatever is checked. Checking
            a sheet only decides whether it prints. Moves made on the lane page but not saved are
            not included.
          </p>
        </section>
        {shown.length === 0 && <p>No sheet matches that search.</p>}
        <ul className={styles.list} aria-label="Recap sheets">
          {shown.map((sheet) => {
            const on = !unchecked.has(sheet.registrationId)
            return (
              <li key={sheet.registrationId} className={`${styles.pick} ${on ? '' : styles.off}`}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={on}
                    aria-label={`Print ${sheet.name}`}
                    onChange={(event) => {
                      check([sheet.registrationId], event.target.checked)
                    }}
                  />
                </label>
                <div>
                  <p className={styles.caption}>
                    <strong>{sheet.name}</strong> · {sheet.divisionName} · lane {sheet.position} ·{' '}
                    <span className={styles.badge}>{on ? 'Printing' : 'Not printing'}</span>
                  </p>
                  <div className={styles.preview}>
                    <RecapSheet sheet={sheet} session={data.session} pattern={pattern} />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </>
    )
  }

  const ready = data !== undefined && sheets.length > 0

  return (
    // A click outside the box is a mouse shortcut. Keyboard users close it with Escape or Close.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={showOnMount}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnBackdrop.current) {
          event.currentTarget.close()
        }
      }}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          Recap sheets{data ? ` · ${formatSessionDate(data.session.date)}` : ''}
        </h2>
        <button
          type="button"
          className={styles.secondary}
          onClick={(event) => {
            event.currentTarget.closest('dialog')?.close()
          }}
        >
          Close
        </button>
      </div>
      {ready ? (
        <>
          <div className={styles.bar}>
            <fieldset className={styles.skip}>
              <legend className={styles.skipLegend}>Skip</legend>
              <label className={styles.skipOption}>
                <input
                  type="radio"
                  name="skip"
                  checked={pattern === 'staggered'}
                  onChange={() => {
                    setPattern('staggered')
                  }}
                />
                <span>Staggered skip</span>
              </label>
              <label className={styles.skipOption}>
                <input
                  type="radio"
                  name="skip"
                  checked={pattern === 'same'}
                  onChange={() => {
                    setPattern('same')
                  }}
                />
                <span>Same skip</span>
              </label>
            </fieldset>
            <span className={styles.spacer} />
            <output>
              {selected.length} of {sheets.length} selected
            </output>
            <button
              type="button"
              className={styles.secondary}
              disabled={selected.length === 0}
              onClick={() => {
                void print(selected)
              }}
            >
              Print selected ({selected.length})
            </button>
            <button
              type="button"
              onClick={() => {
                void print(sheets)
              }}
            >
              Print all
            </button>
          </div>
          <div className={styles.bar}>
            <div className={styles.field}>
              <label htmlFor={filterId}>Find a bowler</label>
              <input
                id={filterId}
                className={styles.input}
                type="search"
                value={filter}
                placeholder="Name or division"
                onChange={(event) => {
                  setFilter(event.target.value)
                }}
              />
            </div>
            <button
              type="button"
              className={styles.secondary}
              disabled={shown.length === 0}
              onClick={() => {
                check(
                  shown.map((sheet) => sheet.registrationId),
                  true,
                )
              }}
            >
              Select shown ({shown.length})
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                check(
                  sheets.map((sheet) => sheet.registrationId),
                  true,
                )
              }}
            >
              Select all
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                check(
                  sheets.map((sheet) => sheet.registrationId),
                  false,
                )
              }}
            >
              Clear
            </button>
            <span className={styles.spacer} />
            <span className={styles.count}>
              Showing {shown.length} of {sheets.length} {plural(sheets.length, 'sheet', 'sheets')}
            </span>
          </div>
        </>
      ) : null}
      {/* The list can outgrow the box, so it scrolls and takes the keyboard. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={styles.scroller} tabIndex={0}>
        {data && data.withoutLane > 0 && (
          <output className={styles.notice}>
            <strong>
              {data.withoutLane} {plural(data.withoutLane, 'bowler has', 'bowlers have')} no lane
              and {plural(data.withoutLane, 'gets', 'get')} no sheet.
            </strong>{' '}
            The lanes in use change the cross, so print after everyone has a lane.
          </output>
        )}
        {data && data.withoutDivision > 0 && (
          <output className={styles.notice}>
            <strong>
              {data.withoutDivision} {plural(data.withoutDivision, 'bowler has', 'bowlers have')} a
              lane but a division that is not in this tournament, so{' '}
              {plural(data.withoutDivision, 'gets', 'get')} no sheet.
            </strong>{' '}
            {plural(data.withoutDivision, 'That lane is', 'Those lanes are')} left out of the lanes
            in use too, so check the registration.
          </output>
        )}
        {body}
      </div>
      {printing && data && (
        <PrintSheets sheets={printing} session={data.session} pattern={pattern} />
      )}
    </dialog>
  )
}
