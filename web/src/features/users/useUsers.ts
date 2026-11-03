import { useMutation, useQuery } from '@tanstack/react-query'
import { createUser, fetchUserOptions } from './api'
import type { NewUser } from './types'

export const userKeys = { options: ['users', 'options'] as const }

export function useUserOptions() {
  return useQuery({ queryKey: userKeys.options, queryFn: fetchUserOptions })
}

export function useCreateUser() {
  return useMutation({ mutationFn: (input: NewUser) => createUser(input) })
}
