import { useState } from 'react'

/** The slider's ends and step, as multiples of the normal speed (RES-63). */
export const MIN_SPEED = 1
export const MAX_SPEED = 2
export const SPEED_STEP = 0.25

const STORAGE_KEY = 'tv-scroll-speed'

function storedSpeed() {
  try {
    const speed = Number(localStorage.getItem(STORAGE_KEY))
    return speed >= MIN_SPEED && speed <= MAX_SPEED ? speed : MIN_SPEED
  } catch {
    return MIN_SPEED
  }
}

/**
 * The TV page's scroll speed, as a multiple of the normal one (RES-63). Each screen remembers its
 * own, so a reload keeps it. A browser that refuses storage still changes speed.
 */
export function useScrollSpeed() {
  const [speed, setSpeed] = useState(storedSpeed)
  const change = (next: number) => {
    setSpeed(next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // Storage is a convenience; the speed holds until the page goes.
    }
  }
  return [speed, change] as const
}
