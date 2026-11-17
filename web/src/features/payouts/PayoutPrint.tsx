import { useEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { startPrint } from '../../shared/print'
import styles from './PayoutPrint.module.css'

export interface PrintColumn {
  label: string
  /** Right-aligned, for money and counts. */
  num?: boolean
}

export interface PrintRow {
  key: string
  cells: readonly string[]
}

export interface PayoutPrintSheetProps {
  tournamentName: string
  title: string
  /** One line under the title: the date, the view, or a filter. */
  subtitle?: string
  columns: readonly PrintColumn[]
  rows: readonly PrintRow[]
  /** Lines at the right of the header: counts and totals. */
  figures: readonly string[]
  /** Adds a blank "Received by" column, for a sheet signed as cash goes out. */
  signature?: boolean
  /** Today, as text, so a test can fix it. */
  printedOn: string
}

/**
 * The payout sheet: a printed table of what an event, or the whole tournament, pays. Letter paper,
 * black on white whatever the theme. It lists the amounts and a box to tick (or a signature line)
 * for each; it never holds an SSN. `PayoutPrintCopy` puts the same sheet in a portal for the
 * printer, like the check-in sheet.
 */
export function PayoutPrintSheet({
  tournamentName,
  title,
  subtitle,
  columns,
  rows,
  figures,
  signature = false,
  printedOn,
}: Readonly<PayoutPrintSheetProps>) {
  return (
    <div className={styles.sheet}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.sub}>{[tournamentName, subtitle].filter(Boolean).join(' · ')}</p>
        </div>
        <p className={styles.meta}>
          {figures.map((figure) => (
            <span key={figure}>
              {figure}
              <br />
            </span>
          ))}
          Printed {printedOn}
        </p>
      </header>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label} className={column.num ? styles.num : undefined}>
                {column.label}
              </th>
            ))}
            {signature && <th className={styles.signature}>Received by</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td
                  key={columns[index]?.label}
                  className={columns[index]?.num ? styles.num : undefined}
                >
                  {cell}
                </td>
              ))}
              {signature && <td />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The sheet to print, in a portal on `document.body`. Hidden on screen. */
function PayoutPrintCopy(props: Readonly<PayoutPrintSheetProps>) {
  return createPortal(
    <div className={styles.root} data-payout-print-copy="">
      <PayoutPrintSheet {...props} />
    </div>,
    document.body,
  )
}

/**
 * A Print button. It puts the print copy on the page, opens the browser's print dialog, and takes
 * the copy away when printing ends. One print at a time; leaving the page mid-print must not leave
 * the page marked for print.
 */
export function PrintPayoutsButton(props: Readonly<PayoutPrintSheetProps & { label?: string }>) {
  const { label = 'Print', ...sheet } = props
  const [printing, setPrinting] = useState(false)
  const endPrint = useRef<() => void>(undefined)

  useEffect(
    () => () => {
      endPrint.current?.()
    },
    // Stryker disable next-line ArrayDeclaration: a constant list also runs the cleanup only on unmount.
    [],
  )

  function print() {
    if (endPrint.current) return
    flushSync(() => {
      setPrinting(true)
    })
    try {
      endPrint.current = startPrint('payout', () => {
        endPrint.current = undefined
        setPrinting(false)
      })
    } catch (error) {
      setPrinting(false)
      throw error
    }
  }

  return (
    <>
      <button type="button" className={styles.button} onClick={print}>
        {label}
      </button>
      {printing && <PayoutPrintCopy {...sheet} />}
    </>
  )
}
