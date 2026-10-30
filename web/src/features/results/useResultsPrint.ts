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

  useEffect(
    () => () => {
      endPrint.current?.()
    },
    [],
  )

  async function print() {
    if (preparing.current || endPrint.current) return
    preparing.current = true
    flushSync(() => {
      setPrinting(true)
    })
    await imagesReady('results')
    preparing.current = false
    endPrint.current = startPrint('results', () => {
      endPrint.current = undefined
      setPrinting(false)
    })
  }

  return { printing, print }
}
