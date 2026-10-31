import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { imagesReady, startPrint } from '../../shared/print'

/**
 * Print the results from the browser (D-78, RES-33). `print()` puts the print copy on the page, waits
 * for its images, and opens the print dialog; `printing` is true while the copy is on the page. One
 * print at a time: a second press waits for the first. Leaving the page while the dialog is open
 * must not leave the page marked for print.
 */
export function useResultsPrint() {
  const [printing, setPrinting] = useState(false)
  const endPrint = useRef<() => void>(undefined)
  const preparing = useRef(false)
  // Stryker disable next-line BooleanLiteral: the effect sets it before any press, so the first value is never read.
  const mounted = useRef(false)

  useEffect(
    () => {
      mounted.current = true
      return () => {
        mounted.current = false
        endPrint.current?.()
      }
    },
    // Stryker disable next-line ArrayDeclaration: a constant list also runs the cleanup only on unmount.
    [],
  )

  async function print() {
    if (preparing.current || endPrint.current) return
    preparing.current = true
    flushSync(() => {
      setPrinting(true)
    })
    try {
      await imagesReady('results')
      // The user left the page while the images loaded: there is no copy to print.
      if (!mounted.current) return
      endPrint.current = startPrint('results', () => {
        endPrint.current = undefined
        setPrinting(false)
      })
    } catch (error) {
      // Unlock the button and drop the copy, then let the failure show.
      setPrinting(false)
      throw error
    } finally {
      preparing.current = false
    }
  }

  return { printing, print }
}
