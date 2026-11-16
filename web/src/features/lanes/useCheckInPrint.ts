import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { startPrint } from '../../shared/print'
import type { CheckInOrder } from './checkIn'

/**
 * Print the check-in sheet from the browser. `print(order)` puts the print copy on the page and
 * opens the print dialog; `order` is the order being printed, or `undefined` when nothing prints.
 * One print at a time: a second press waits for the first. Leaving the page while the dialog is
 * open must not leave the page marked for print.
 */
export function useCheckInPrint() {
  const [order, setOrder] = useState<CheckInOrder>()
  const endPrint = useRef<() => void>(undefined)

  useEffect(
    () => () => {
      endPrint.current?.()
    },
    // Stryker disable next-line ArrayDeclaration: a constant list also runs the cleanup only on unmount.
    [],
  )

  function print(next: CheckInOrder) {
    if (endPrint.current) return
    flushSync(() => {
      setOrder(next)
    })
    try {
      endPrint.current = startPrint('checkin', () => {
        endPrint.current = undefined
        setOrder(undefined)
      })
    } catch (error) {
      setOrder(undefined)
      throw error
    }
  }

  return { order, print }
}
