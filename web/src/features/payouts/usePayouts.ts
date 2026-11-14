import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { retryUnlessNotFound, tournamentKeys } from '../../shared/tournamentQuery'
import {
  fetchPayouts,
  fetchSheet,
  fetchTotals,
  PayoutNotFoundError,
  savePayouts,
  setPaid,
} from './api'
import type { PayoutSource, SaveRow } from './types'

export const payoutKeys = {
  /** Every payout answer of one tournament. A save or a toggle invalidates this. */
  all: (tournamentId: string) => [...tournamentKeys.detail(tournamentId), 'payouts'] as const,
  sheet: (source: PayoutSource, tournamentId: string, eventId: string) =>
    [...payoutKeys.all(tournamentId), 'sheet', source, eventId] as const,
  list: (tournamentId: string) => [...payoutKeys.all(tournamentId), 'list'] as const,
  totals: (tournamentId: string, min: string) =>
    [...payoutKeys.all(tournamentId), 'totals', min] as const,
}

/** Once, and never for a missing event or tournament: a second try answers the same. */
const retryUnlessMissing = (failureCount: number, error: Error) =>
  !(error instanceof PayoutNotFoundError) && retryUnlessNotFound(failureCount, error)

export function usePayoutSheet(source: PayoutSource, tournamentId: string, eventId: string) {
  return useQuery({
    queryKey: payoutKeys.sheet(source, tournamentId, eventId),
    queryFn: () => fetchSheet(source, tournamentId, eventId),
    retry: retryUnlessMissing,
  })
}

export function usePayouts(tournamentId: string) {
  return useQuery({
    queryKey: payoutKeys.list(tournamentId),
    queryFn: () => fetchPayouts(tournamentId),
    retry: retryUnlessMissing,
  })
}

/** `min` is what the director typed; the API checks it (PAY-19). */
export function usePayoutTotals(tournamentId: string, min: string) {
  return useQuery({
    queryKey: payoutKeys.totals(tournamentId, min.trim()),
    queryFn: () => fetchTotals(tournamentId, min),
    retry: false,
  })
}

/**
 * Save one event's payouts (PAY-12). A save changes the sheet, the full list, the totals, and the
 * Complete dialog's counts, so all of them are asked for again.
 */
export function useSavePayouts(source: PayoutSource, tournamentId: string, eventId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ rows, confirmPaid }: { rows: readonly SaveRow[]; confirmPaid: boolean }) =>
      savePayouts(source, tournamentId, eventId, rows, confirmPaid),
    onSuccess: (sheet) => {
      queryClient.setQueryData(payoutKeys.sheet(source, tournamentId, eventId), sheet)
      void queryClient.invalidateQueries({ queryKey: payoutKeys.all(tournamentId) })
      void queryClient.invalidateQueries({
        queryKey: [...tournamentKeys.detail(tournamentId), 'complete-info'],
      })
    },
  })
}

/** Tick or untick Paid on the full list (PAY-13). */
export function useSetPaid(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ payoutId, paid }: { payoutId: string; paid: boolean }) =>
      setPaid(tournamentId, payoutId, paid),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: payoutKeys.all(tournamentId) })
      void queryClient.invalidateQueries({
        queryKey: [...tournamentKeys.detail(tournamentId), 'complete-info'],
      })
    },
  })
}
