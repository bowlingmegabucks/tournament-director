import { useSearchParams } from 'react-router'
import type { RankMode } from './types'

/**
 * The ranking on screen: the one in `?mode=`, else the steady `full-game` (RES-45, D-239). An unknown
 * value falls back to the steady mode, so an old or mistyped link still opens something. Nothing is
 * stored: the address carries it.
 */
export function useChosenMode(): RankMode {
  const [search] = useSearchParams()
  return search.get('mode') === 'live' ? 'live' : 'full-game'
}
