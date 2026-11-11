import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined
  const media = matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => {
    media.removeEventListener('change', onChange)
  }
}

const read = () => typeof matchMedia === 'function' && matchMedia(QUERY).matches

/** Whether the viewer asks for less motion (RES-53): the TV then flips pages and does not scroll. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}
