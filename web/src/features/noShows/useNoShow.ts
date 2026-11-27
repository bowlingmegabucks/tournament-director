import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { applyNoShow, NoShowChangedError, previewNoShow, type NoShowTarget } from './api'
import type { Choice } from './types'

const previewKey = (target: NoShowTarget, choice: Choice | undefined) =>
  [
    ...tournamentKeys.detail(target.tournamentId),
    'no-show-preview',
    target.squadId,
    target.registrationId,
    choice,
  ] as const

/**
 * The preview of one choice, read fresh each time. While a new tick is being worked out the last
 * preview stays on screen, so the boxes do not vanish (`isPlaceholderData`).
 */
export function useNoShowPreview(target: NoShowTarget, choice: Choice | undefined) {
  return useQuery({
    queryKey: previewKey(target, choice),
    queryFn: () => {
      if (!choice) throw new Error('Choose what to do first')
      return previewNoShow(target, choice)
    },
    enabled: choice !== undefined,
    placeholderData: choice === undefined ? undefined : keepPreviousData,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/** Save the change, then refresh everything under the tournament. */
export function useApplyNoShow(target: NoShowTarget) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ choice, version }: { choice: Choice; version: string }) =>
      applyNoShow(target, choice, version),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: tournamentKeys.detail(target.tournamentId),
        predicate: (query) => !query.queryKey.includes('no-show-preview'),
      }),
    onError: (error, { choice }) => {
      // Show what it would do now, so the admin can review it again.
      if (error instanceof NoShowChangedError) {
        queryClient.setQueryData(previewKey(target, choice), error.preview)
      }
    },
  })
}
