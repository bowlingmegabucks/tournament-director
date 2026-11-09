import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { deleteRegistration } from './deleteApi'
import { editInfoSegment } from './useEditInfo'
import { deleteInfoSegment } from './useDeleteInfo'

/**
 * Delete a registration, then refresh the lists under the tournament: registrations and counts, the
 * squad and sweeper pages, and the lane pages (D-209). The reads of this one registration are left
 * alone: the page is about to leave, and a refetch would only fail with "not found".
 */
export function useDeleteRegistration(tournamentId: string, registrationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (confirmPaid: number | undefined) =>
      deleteRegistration(tournamentId, registrationId, confirmPaid),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.detail(tournamentId),
        predicate: (query) =>
          !query.queryKey.includes(editInfoSegment) && !query.queryKey.includes(deleteInfoSegment),
      }),
  })
}
