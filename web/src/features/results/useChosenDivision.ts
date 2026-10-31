import { useSearchParams } from 'react-router'

/**
 * The division on screen: the one in `?division=`, else the first (D-80, D-89). An unknown id falls
 * back to the first, so an old link still opens something.
 */
export function useChosenDivision<Division extends { id: string }>(
  divisions: readonly Division[],
): Division | undefined {
  const [search] = useSearchParams()
  return divisions.find((division) => division.id === search.get('division')) ?? divisions[0]
}
