// Printing part of the page from the browser (D-62, D-78). The print copy is already on the page
// when `startPrint` runs; the page marks itself so the app hides and only the copy prints. Each
// feature picks a `name` (`recap`, `results`): its copy carries `data-<name>-print-copy` and the body
// gets `data-<name>-printing` while it prints (see PrintSheets.module.css, PrintResults.module.css).

/**
 * Wait until every image in the print copy can paint, so the sponsor image is on the first page.
 * An image that fails to load does not block printing.
 */
export async function imagesReady(name: string, root: ParentNode = document): Promise<void> {
  const images = [...root.querySelectorAll<HTMLImageElement>(`[data-${name}-print-copy] img`)]
  const loading = images.filter((image) => !image.complete && typeof image.decode === 'function')
  await Promise.all(loading.map((image) => image.decode().catch(() => undefined)))
}

/**
 * Mark the page, open the print dialog, and call `done` once, when the browser says printing is
 * over. Two signals end it, because browsers differ on a cancelled dialog: the `afterprint` event
 * and the print media query going off. The returned function ends it early (the dialog closed),
 * and is safe to call more than once. If the dialog cannot open, the page is unmarked and the
 * error is thrown.
 */
export function startPrint(name: string, done: () => void): () => void {
  const flag = `${name}Printing`
  const query = window.matchMedia('print')
  document.body.dataset[flag] = ''
  let ended = false

  const end = () => {
    if (ended) return
    ended = true
    delete document.body.dataset[flag]
    window.removeEventListener('afterprint', end)
    query.removeEventListener('change', onChange)
    done()
  }
  function onChange(event: MediaQueryListEvent) {
    if (!event.matches) end()
  }

  window.addEventListener('afterprint', end)
  query.addEventListener('change', onChange)
  try {
    window.print()
  } catch (error) {
    end()
    throw error
  }
  return end
}
