import { useQuery, useQueryClient } from '@tanstack/react-query'
import { retryUnlessFinal } from '../../shared/session'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { useEventStream, type LiveState } from '../../shared/useEventStream'
import {
  fetchAtLarge,
  fetchSeeding,
  fetchSquadResults,
  fetchSuperSweeper,
  fetchSweeperResults,
  ResultsUnavailableError,
} from './api'
import type { FinalsKind, RankMode, SessionKind } from './types'

/**
 * How often a finals page asks again (D-88): at-large, seeding, and the super sweeper read several
 * sessions, so they keep the poll (D-247). TanStack Query pauses the timer while the browser tab is
 * in the background. The squad and sweeper tabs use the stream instead (D-241).
 */
export const RESULTS_REFRESH_MS = 15_000

export const resultKeys = {
  /** Every answer of one squad or sweeper, in both modes. The stream invalidates this. */
  session: (kind: SessionKind, tournamentId: string, sessionId: string) =>
    [...tournamentKeys.detail(tournamentId), `${kind}s`, sessionId, 'results'] as const,
  page: (kind: SessionKind, tournamentId: string, sessionId: string, mode: RankMode) =>
    [...resultKeys.session(kind, tournamentId, sessionId), mode] as const,
  finals: (kind: FinalsKind, tournamentId: string, mode?: RankMode) =>
    [...tournamentKeys.detail(tournamentId), kind, 'results', ...(mode ? [mode] : [])] as const,
}

/**
 * The one retry rule of every results query: once, but not for a missing tournament or session or a
 * ratio the results cannot use (a second try answers the same).
 */
export function retryUnlessFinalResults(failureCount: number, error: Error): boolean {
  return !(error instanceof ResultsUnavailableError) && retryUnlessFinal(failureCount, error)
}

export function useSquadResults(tournamentId: string, sessionId: string, mode: RankMode) {
  return useQuery({
    queryKey: resultKeys.page('squad', tournamentId, sessionId, mode),
    queryFn: () => fetchSquadResults(tournamentId, sessionId, mode),
    retry: retryUnlessFinalResults,
  })
}

export function useSweeperResults(tournamentId: string, sessionId: string, mode: RankMode) {
  return useQuery({
    queryKey: resultKeys.page('sweeper', tournamentId, sessionId, mode),
    queryFn: () => fetchSweeperResults(tournamentId, sessionId, mode),
    retry: retryUnlessFinalResults,
  })
}

/**
 * Keeps the squad or sweeper Results tab fresh from the public stream of its session (RES-44, D-241):
 * every message, whatever its kind, asks for the results again in both modes, since a score, a
 * lane move, an entry, a DNF flag, or a complete can each change a place. The shared stream hook
 * joins a burst of messages and polls on a timer while the stream is down. `enabled` is false for a
 * complete session (D-10): its results cannot change.
 */
export function useResultsEvents(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
  enabled: boolean,
): LiveState {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: resultKeys.session(kind, tournamentId, sessionId),
    })
  }
  return useEventStream(
    `/v1/tournaments/${tournamentId}/${kind}s/${sessionId}/scores/events`,
    enabled,
    { onChange: refresh, onReconnect: refresh },
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
    retry: retryUnlessFinalResults,
    refetchInterval: stopWhenComplete,
  })
}

export function useSeeding(tournamentId: string) {
  return useQuery({
    queryKey: resultKeys.finals('seeding', tournamentId),
    queryFn: () => fetchSeeding(tournamentId),
    retry: retryUnlessFinalResults,
    refetchInterval: stopWhenComplete,
  })
}

export function useSuperSweeper(tournamentId: string, mode: RankMode) {
  return useQuery({
    queryKey: resultKeys.finals('super-sweeper', tournamentId, mode),
    queryFn: () => fetchSuperSweeper(tournamentId, mode),
    retry: retryUnlessFinalResults,
    refetchInterval: stopWhenComplete,
  })
}
