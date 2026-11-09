import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { patchRegistration } from './editApi'
import { editInfoSegment } from './useEditInfo'
import type { EditRegistrationRequest } from './types'

/**
 * Save an edit, then refresh everything under the tournament: the registrations list and counts,
 * the squad and sweeper pages, and the lane pages (D-197). A refusal refreshes too: it can mean the
 * page was out of date (D-199). The edit read itself is left as it is: the form measures its changes
 * against the record the desk read, and a refetch would move that ground under unsaved edits.
 */
export function useEditRegistration(tournamentId: string, registrationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: EditRegistrationRequest) =>
      patchRegistration(tournamentId, registrationId, request),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: tournamentKeys.detail(tournamentId),
        predicate: (query) => !query.queryKey.includes(editInfoSegment),
      })
    },
  })
}
