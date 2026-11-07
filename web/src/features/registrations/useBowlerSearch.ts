import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { NoSearchFieldError, searchBowlers, type BowlerFilter } from './bowlerApi'

export const bowlerKeys = {
  search: (tournamentId: string, filter: BowlerFilter) =>
    [...tournamentKeys.detail(tournamentId), 'bowler-search', filter] as const,
  detail: (tournamentId: string, bowlerId: string) =>
    [...tournamentKeys.detail(tournamentId), 'bowler', bowlerId] as const,
}

/**
 * The desk's bowler search (BWL-14). It runs once a filter is submitted (`filter` is null before).
 * A result is never reused for long: a bowler registered a moment ago must show as Registered.
 */
export function useBowlerSearch(tournamentId: string, filter: BowlerFilter | null) {
  return useQuery({
    queryKey: bowlerKeys.search(
      tournamentId,
      filter ?? { lastName: '', firstName: '', email: '', usbcId: '' },
    ),
    queryFn: () => {
      if (filter === null) throw new NoSearchFieldError()
      return searchBowlers(filter, tournamentId)
    },
    enabled: filter !== null,
    staleTime: 0,
    gcTime: 0,
    placeholderData: keepPreviousData,
    // The page has Try again: a silent retry would only hide the error for a second.
    retry: false,
  })
}
