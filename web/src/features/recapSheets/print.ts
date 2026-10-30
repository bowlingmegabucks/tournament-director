// Printing the recap sheets from the browser (D-62). The print copy is already on the page when
// `startPrint` runs; the page marks itself so the app hides and only the copy prints
// (see PrintSheets.module.css).

const FLAG = 'recapPrinting'

/**
 * Wait until every image in the print copy can paint, so the sponsor image is on the first page.
 * An image that fails to load does not block printing.
 */
export async function imagesReady(root: ParentNode = document): Promise<void> {
  const images = [...root.querySelectorAll<HTMLImageElement>('[data-recap-print-copy] img')]
  await Promise.all(
    images.map((image) =>
      image.complete || typeof image.decode !== 'function'
        ? undefined
        : image.decode().catch(() => undefined),
    ),
  )
}

/**
 * Mark the page, open the print dialog, and call `done` once, when the browser says printing is
 * over. Two signals end it, because browsers differ on a cancelled dialog: the `afterprint` event
 * and the print media query going off. The returned function ends it early (the dialog closed),
 * and is safe to call more than once.
 */
export function startPrint(done: () => void): () => void {
  document.body.dataset[FLAG] = ''
  const query = window.matchMedia('print')
  let ended = false

  const end = () => {
    if (ended) return
    ended = true
    delete document.body.dataset[FLAG]
    window.removeEventListener('afterprint', end)
    query.removeEventListener('change', onChange)
    done()
  }
  function onChange(event: MediaQueryListEvent) {
    if (!event.matches) end()
  }

  window.addEventListener('afterprint', end)
  query.addEventListener('change', onChange)
  window.print()
  return end
}
