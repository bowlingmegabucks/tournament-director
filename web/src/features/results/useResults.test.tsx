import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSquadResults, createSweeperResults } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { ResultsUnavailableError } from './api'
import {
  RESULTS_REFRESH_MS,
  resultKeys,
  retryUnlessFinalResults,
  useSquadResults,
  useSweeperResults,
} from './useResults'

afterEach(() => {
  vi.useRealTimers()
})

function wrapper() {
  const client = new QueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

/** Serve `status` for the results of one kind and count the requests. */
function serveStatus(path: string, status: number) {
  const calls = { count: 0 }
  server.use(
    http.get(path, () => {
      calls.count += 1
      return HttpResponse.json({ message: 'no' }, { status })
    }),
  )
  return calls
}

describe('resultKeys', () => {
  it('keys the results under the tournament, apart for squads and sweepers', () => {
    expect(resultKeys.page('squad', 't1', 's1')).toEqual([
      'tournaments',
      't1',
      'squads',
      's1',
      'results',
    ])
    expect(resultKeys.page('sweeper', 't1', 's1')).toEqual([
      'tournaments',
      't1',
      'sweepers',
      's1',
      'results',
    ])
  })
})

describe.each([
  ['useSquadResults', useSquadResults, 'squads', () => createSquadResults()],
  ['useSweeperResults', useSweeperResults, 'sweepers', () => createSweeperResults()],
] as const)('%s (RES-31, D-79, D-83)', (_name, useResults, folder, create) => {
  const path = `/v1/tournaments/:id/${folder}/:sessionId/results`

  it('loads the results of the session', async () => {
    const results = create()
    server.use(http.get(path, () => HttpResponse.json(results)))

    const { result } = renderHook(() => useResults('t1', 's1'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toEqual(results), { timeout: 3000 })
  })

  it('asks again after 15 seconds while the session is open (RES-34)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const results = create()
    let count = 0
    server.use(
      http.get(path, () => {
        count += 1
        return HttpResponse.json(results)
      }),
    )
    const { result } = renderHook(() => useResults('t1', 's1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 })

    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS + 100)

    await waitFor(() => expect(count).toBe(2))
  })

  it('never asks again once the session is complete (D-10)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const results = create()
    let count = 0
    server.use(
      http.get(path, () => {
        count += 1
        return HttpResponse.json({ ...results, session: { ...results.session, complete: true } })
      }),
    )
    const { result } = renderHook(() => useResults('t1', 's1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 })

    // Several intervals, with real time passing, so a refresh that should not happen has time to land.
    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS * 3)
    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS * 3)

    expect(result.current.fetchStatus).toBe('idle')
    expect(count).toBe(1)
  })

  it.each([
    [404, 'a missing session'],
    [422, 'a ratio the results cannot use'],
  ])('does not retry %i (%s): a second try answers the same', async (status) => {
    const calls = serveStatus(path, status)

    const { result } = renderHook(() => useResults('t1', 's1'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 })
    expect(calls.count).toBe(1)
  })

  it('retries another failure once', async () => {
    const calls = serveStatus(path, 500)

    const { result } = renderHook(() => useResults('t1', 's1'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 })
    expect(calls.count).toBe(2)
  })
})

describe('retryUnlessFinalResults (D-88, D-93)', () => {
  it('retries one failure once, then stops', () => {
    expect(retryUnlessFinalResults(0, new Error('boom'))).toBe(true)
    expect(retryUnlessFinalResults(1, new Error('boom'))).toBe(false)
    expect(retryUnlessFinalResults(2, new Error('boom'))).toBe(false)
  })

  it('never retries a ratio the results cannot use, or a missing tournament', () => {
    expect(retryUnlessFinalResults(0, new ResultsUnavailableError('ratio is 0'))).toBe(false)
    expect(retryUnlessFinalResults(0, new TournamentNotFoundError())).toBe(false)
  })
})
