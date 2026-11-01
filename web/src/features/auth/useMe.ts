import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, signIn, signOut } from './api'
import type { Me } from './types'

export const meKeys = { all: ['me'] as const }

const STALE_MS = 60_000

/** Who is signed in and what they may do: the one source for both (D-19, D-96, D-102). */
export function useMe() {
  return useQuery({ queryKey: meKeys.all, queryFn: fetchMe, staleTime: STALE_MS })
}

export function useSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),
    // The sign-in body lacks permissions, so ask /v1/me and wait for it before the page moves on.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKeys.all }),
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: signOut,
    onSuccess: () => queryClient.setQueryData<Me>(meKeys.all, { user: null }),
  })
}
