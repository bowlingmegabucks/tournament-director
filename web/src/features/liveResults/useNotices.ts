import { useCallback, useEffect, useRef, useState } from 'react'

/** How long each message of the strip shows (D-245). */
export const NOTICE_MS = 8000

/** The most messages that wait. A burst past it drops the oldest, so the strip never runs minutes behind. */
const MAX_WAITING = 12

interface Notice {
  id: number
  text: string
}

/**
 * The messages of the TV's notice strip (D-245): they queue and show one at a time, `duration`
 * each. `current` is the one showing, `undefined` when none waits. An effect is right here: a
 * timer is outside React. The timer is keyed on the message's id, so a second message does not
 * restart the one showing and two equal messages in a row each get their time.
 */
export function useNotices(duration = NOTICE_MS) {
  const [queue, setQueue] = useState<Notice[]>([])
  const next = useRef(0)
  const current = queue[0]

  // Stryker disable next-line ArrayDeclaration: `setQueue` never changes, so the list of what it depends on is moot.
  const push = useCallback((text: string) => {
    // Stryker disable next-line AssignmentOperator: ids only need to differ, up or down.
    next.current += 1
    const notice = { id: next.current, text }
    setQueue((waiting) => [...waiting, notice].slice(-MAX_WAITING))
  }, [])

  const currentId = current?.id
  useEffect(() => {
    if (currentId === undefined) return
    const timer = setTimeout(() => {
      setQueue((waiting) => waiting.filter((notice) => notice.id !== currentId))
    }, duration)
    return () => {
      clearTimeout(timer)
    }
  }, [currentId, duration])

  return { current: current?.text, push }
}
