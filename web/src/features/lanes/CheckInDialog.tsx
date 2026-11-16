import { useId, useRef, useState } from 'react'
import { buildCheckIn, type CheckInOrder } from './checkIn'
import { CheckInPrintCopy, CheckInSheet } from './CheckInSheet'
import styles from './CheckInDialog.module.css'
import type { LanePage } from './types'
import { useCheckInPrint } from './useCheckInPrint'

interface CheckInDialogProps {
  page: LanePage
  tournamentName: string
  onClose: () => void
}

// A native modal <dialog> traps focus, closes on Escape, and gives focus back to the button that
// opened it. The ref callback opens it once it is on the page.
function showOnMount(node: HTMLDialogElement | null) {
  if (node && !node.open) node.showModal()
}

/**
 * The check-in sheet preview and print: a modal over the lane page with the sheet as it will
 * print, a choice of order, and a Print button. The sheet reads the page the lane page already
 * holds, so a move on the page shows here at once.
 */
export function CheckInDialog({ page, tournamentName, onClose }: Readonly<CheckInDialogProps>) {
  const titleId = useId()
  const [order, setOrder] = useState<CheckInOrder>('lane')
  const checkIn = useCheckInPrint()
  // Where the last mouse press landed, so a drag that ends on the backdrop does not close it.
  const pressedOnBackdrop = useRef(false)
  const groups = buildCheckIn(page, order)
  const props = {
    tournamentName,
    kind: page.session.kind,
    date: page.session.date,
    order,
    groups,
    printedOn: new Date().toLocaleDateString('en-US'),
  }

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
          Check-in sheet
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
      <div className={styles.bar}>
        <fieldset className={styles.order}>
          <legend className={styles.legend}>Order</legend>
          <label className={styles.option}>
            <input
              type="radio"
              name="checkin-order"
              checked={order === 'lane'}
              onChange={() => {
                setOrder('lane')
              }}
            />
            <span>Lane order</span>
          </label>
          <label className={styles.option}>
            <input
              type="radio"
              name="checkin-order"
              checked={order === 'name'}
              onChange={() => {
                setOrder('name')
              }}
            />
            <span>A to Z (last, first)</span>
          </label>
        </fieldset>
        <span className={styles.spacer} />
        <button
          type="button"
          onClick={() => {
            checkIn.print(order)
          }}
        >
          Print
        </button>
      </div>
      {/* The preview can outgrow the box, so it scrolls and takes the keyboard. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <section className={styles.scroller} tabIndex={0} aria-label="Check-in sheet preview">
        <div className={styles.preview}>
          <CheckInSheet {...props} />
        </div>
      </section>
      {checkIn.order && (
        <CheckInPrintCopy
          {...props}
          order={checkIn.order}
          groups={buildCheckIn(page, checkIn.order)}
        />
      )}
    </dialog>
  )
}
