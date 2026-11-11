import { useEffect } from 'react'

/**
 * Asks the browser to keep the screen awake while the TV page is open (RES-52, D-246), and asks
 * again when the tab comes back, since the browser lets the lock go when a tab is hidden. A
 * browser without the feature, a page that is not served over https, or a refusal leaves the page
 * as it was: the screen may sleep, and nothing else changes. An effect is right here: the lock
 * belongs to the browser.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    let stopped = false

    const ask = () => {
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (stopped) {
            void sentinel.release().catch(() => undefined)
            return
          }
          // A second request must not strand the first lock: cleanup releases only `lock`.
          void lock?.release().catch(() => undefined)
          lock = sentinel
        })
        .catch(() => undefined)
    }
    const back = () => {
      if (document.visibilityState === 'visible') ask()
    }
    ask()
    document.addEventListener('visibilitychange', back)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', back)
      void lock?.release().catch(() => undefined)
    }
  }, [])
}
