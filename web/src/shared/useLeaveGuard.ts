import { useCallback, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router'

/**
 * Stops the director from leaving a form with changes they have not saved. A move to another page
 * is held until the director picks Stay or Leave (`LeaveDialog` shows the choice); closing or
 * reloading the tab gets the browser's own prompt.
 *
 * Wrap the save in `whileSaving`: a save that works moves to another page, and that move must not
 * ask. A save that fails ends the wrapper, so the guard holds again.
 *
 * Needs a data router (`createBrowserRouter`, `createMemoryRouter`); a plain `<BrowserRouter>`
 * has no `useBlocker`. This is like asking a .NET user "Discard changes?" in a `Closing` handler.
 */
export function useLeaveGuard(dirty: boolean) {
  const saving = useRef(false)
  const shouldBlock = useCallback(() => dirty && !saving.current, [dirty])
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      if (saving.current) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
    }
  }, [dirty])

  async function whileSaving<T>(work: () => Promise<T>): Promise<T> {
    saving.current = true
    try {
      return await work()
    } finally {
      saving.current = false
    }
  }

  return { blocker, whileSaving }
}
