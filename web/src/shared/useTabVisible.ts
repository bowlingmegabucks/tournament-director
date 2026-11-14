import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => {
    document.removeEventListener('visibilitychange', onChange)
  }
}

const isVisible = () => document.visibilityState !== 'hidden'

/**
 * Whether this browser tab is in front. A page that holds a live stream only for a nicety can close
 * it while the tab is hidden and open it again on return. The .NET twin has none; this is the
 * browser's Page Visibility API.
 */
export function useTabVisible(): boolean {
  return useSyncExternalStore(subscribe, isVisible, () => true)
}
