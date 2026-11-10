import { useState } from 'react'
import type { LaneRange } from './entryLogic'

const key = (sessionId: string) => `scoreEntryLanes:${sessionId}`
const EMPTY: LaneRange = { from: '', to: '' }

function read(sessionId: string): LaneRange {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key(sessionId)) ?? 'null')
    if (typeof parsed === 'object' && parsed !== null) {
      const from: unknown = Reflect.get(parsed, 'from')
      const to: unknown = Reflect.get(parsed, 'to')
      if (typeof from === 'string' && typeof to === 'string') return { from, to }
    }
  } catch {
    // Storage may be off or hold something else: start with every lane.
  }
  return EMPTY
}

function write(sessionId: string, range: LaneRange) {
  try {
    localStorage.setItem(key(sessionId), JSON.stringify(range))
  } catch {
    // Storage may be off: the range still works until the page closes.
  }
}

/**
 * The lanes a keeper works (D-230), kept on this device for each session so the next visit starts
 * where this one stopped. It is a convenience: it hides pairs, locks nothing, and never reaches
 * the server, so five keepers can each have their own. Storage is wrapped: the page works without it.
 */
export function useLaneRange(sessionId: string): [LaneRange, (next: LaneRange) => void] {
  const [stored, setStored] = useState(() => ({ sessionId, range: read(sessionId) }))
  // Another session in the same mounted page starts from its own saved range.
  const range = stored.sessionId === sessionId ? stored.range : read(sessionId)
  return [
    range,
    (next) => {
      setStored({ sessionId, range: next })
      write(sessionId, next)
    },
  ]
}
