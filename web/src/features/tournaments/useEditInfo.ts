import { useQuery } from '@tanstack/react-query'
import { retryUnlessNotFound, tournamentKeys } from '../../shared/tournamentQuery'
import { fetchEditInfo } from './api'

/** What depends on one tournament's settings, for the edit page (TRN-28). */
export function useEditInfo(id: string) {
  return useQuery({
    queryKey: [...tournamentKeys.detail(id), 'edit-info'] as const,
    queryFn: () => fetchEditInfo(id),
    retry: retryUnlessNotFound,
  })
}
