import { useQuery } from '@tanstack/react-query'
import { retryUnlessFinal } from '../../shared/session'
import { TournamentNotFoundError, tournamentKeys } from '../../shared/tournamentQuery'
import {
  fetchAtLarge,
  fetchSeeding,
  fetchSquadResults,
  fetchSuperSweeper,
  fetchSweeperResults,
  ResultsUnavailableError,
} from './api'
import type { FinalsKind, SessionKind } from './types'

/**
 * How often the Results tab asks again, until a push channel exists (D-79, Q-33). TanStack Query
 * pauses the timer while the browser tab is in the background, and a complete session does not ask
 * again. A failed refresh leaves the last results on screen.
 */
export const RESULTS_REFRESH_MS = 15_000

export const resultKeys = {
  page: (kind: SessionKind, tournamentId: string, sessionId: string) =>
    [...tournamentKeys.detail(tournamentId), `${kind}s`, sessionId, 'results'] as const,
  finals: (kind: FinalsKind, tournamentId: string) =>
    [...tournamentKeys.detail(tournamentId), kind, 'results'] as const,
}

/** Retry once, but not a missing session or a ratio the results cannot use: a second try answers the same. */
function retryUnlessFinalResults(failureCount: number, error: Error): boolean {
  return !(error instanceof ResultsUnavailableError) && retryUnlessFinal(failureCount, error)
}

export function useSquadResults(tournamentId: string, sessionId: string) {
  return useQuery({
    queryKey: resultKeys.page('squad', tournamentId, sessionId),
    queryFn: () => fetchSquadResults(tournamentId, sessionId),
    retry: retryUnlessFinalResults,
    // A complete session cannot change (D-10), so it stops asking.
    refetchInterval: (query) => (query.state.data?.session.complete ? false : RESULTS_REFRESH_MS),
  })
}

export function useSweeperResults(tournamentId: string, sessionId: string) {
  return useQuery({
    queryKey: resultKeys.page('sweeper', tournamentId, sessionId),
    queryFn: () => fetchSweeperResults(tournamentId, sessionId),
    retry: retryUnlessFinalResults,
    refetchInterval: (query) => (query.state.data?.session.complete ? false : RESULTS_REFRESH_MS),
  })
}

/** Retry once, but not a missing tournament or a ratio the results cannot use. */
export function retryUnlessFinalFinals(failureCount: number, error: Error): boolean {
  return (
    !(error instanceof ResultsUnavailableError) &&
    !(error instanceof TournamentNotFoundError) &&
    failureCount < 1
  )
}

// A tournament part that is not complete can still change (D-88), so it asks again every 15
// seconds; once every squad (or sweeper) is complete it stops. A failed refresh keeps the last results.
const stopWhenComplete = (query: { state: { data?: { complete: boolean } } }) =>
  query.state.data?.complete ? false : RESULTS_REFRESH_MS

export function useAtLarge(tournamentId: string) {
  return useQuery({
    queryKey: resultKeys.finals('at-large', tournamentId),
    queryFn: () => fetchAtLarge(tournamentId),
    retry: retryUnlessFinalFinals,
    refetchInterval: stopWhenComplete,
  })
}

export function useSeeding(tournamentId: string) {
  return useQuery({
    queryKey: resultKeys.finals('seeding', tournamentId),
    queryFn: () => fetchSeeding(tournamentId),
    retry: retryUnlessFinalFinals,
    refetchInterval: stopWhenComplete,
  })
}

export function useSuperSweeper(tournamentId: string) {
  return useQuery({
    queryKey: resultKeys.finals('super-sweeper', tournamentId),
    queryFn: () => fetchSuperSweeper(tournamentId),
    retry: retryUnlessFinalFinals,
    refetchInterval: stopWhenComplete,
  })
}
