import { useMutation } from '@tanstack/react-query'
import { deleteTournament } from './api'

/**
 * Delete one tournament (TRN-36). It does not touch the cache itself: the page navigates away
 * first, then drops the cached reads. Doing it here would refetch the deleted id while the
 * tournament layout is still on screen and flash "not found".
 */
export function useDeleteTournament(id: string) {
  return useMutation({
    mutationFn: (options: { confirmWarnings: boolean }) => deleteTournament(id, options),
  })
}
