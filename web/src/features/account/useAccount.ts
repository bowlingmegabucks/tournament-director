import { useMutation, useQueryClient } from '@tanstack/react-query'
import { meKeys } from '../auth/useMe'
import { changePassword, updateName } from './api'

export function useChangePassword() {
  return useMutation({
    mutationFn: ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string
      newPassword: string
    }) => changePassword(currentPassword, newPassword),
  })
}

export function useUpdateName() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => updateName(name),
    // The top bar shows the name, and it comes from `/v1/me`.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKeys.all }),
  })
}
