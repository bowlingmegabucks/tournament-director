import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createDeskRegistration } from './bowlerApi'
import type { DeskRegistrationRequest } from './types'
import { registrationKeys } from './useRegistrations'

/** Add a registration at the desk, then refresh the list (D-157). */
export function useCreateRegistration(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: DeskRegistrationRequest) => createDeskRegistration(tournamentId, request),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: registrationKeys.list(tournamentId) }),
  })
}
