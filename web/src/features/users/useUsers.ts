import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { meKeys } from '../auth/useMe'
import {
  createUser,
  fetchUserOptions,
  fetchUsers,
  sendPasswordReset,
  setUserDisabled,
  updateUserRoles,
} from './api'
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

export function useSetUserDisabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, disabled }: { userId: string; disabled: boolean }) =>
      setUserDisabled(userId, disabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.list }),
  })
}

export function useUpdateUserRoles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, roles }: { userId: string; roles: string[] }) =>
      updateUserRoles(userId, roles),
    onSuccess: () =>
      // An admin may have changed their own roles, so who-am-I is stale too.
      Promise.all([
        queryClient.invalidateQueries({ queryKey: userKeys.list }),
        queryClient.invalidateQueries({ queryKey: meKeys.all }),
      ]),
  })
}
