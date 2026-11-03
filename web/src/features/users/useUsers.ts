import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createUser, fetchUserOptions, fetchUsers, sendPasswordReset } from './api'
import type { NewUser } from './types'

export const userKeys = { options: ['users', 'options'] as const, list: ['users', 'list'] as const }

export function useUserOptions() {
  return useQuery({ queryKey: userKeys.options, queryFn: fetchUserOptions })
}

export function useUsers() {
  return useQuery({ queryKey: userKeys.list, queryFn: fetchUsers })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewUser) => createUser(input),
    // The new user belongs on the list.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.list }),
  })
}

export function useSendPasswordReset() {
  return useMutation({ mutationFn: (userId: string) => sendPasswordReset(userId) })
}
