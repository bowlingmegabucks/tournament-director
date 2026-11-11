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
    expect(resultKeys.page('squad', 't1', 's1', 'full-game')).toEqual([
      'tournaments',
      't1',
      'squads',
      's1',
      'results',
      'full-game',
    ])
    expect(resultKeys.page('sweeper', 't1', 's1', 'live')).toEqual([
      'tournaments',
      't1',
      'sweepers',
      's1',
      'results',
      'live',
    ])
  })

  it('keeps both modes of a session under one key the stream can invalidate (RES-44)', () => {
    const session = resultKeys.session('squad', 't1', 's1')
    expect(resultKeys.page('squad', 't1', 's1', 'full-game').slice(0, session.length)).toEqual(
      session,
    )
    expect(resultKeys.page('squad', 't1', 's1', 'live').slice(0, session.length)).toEqual(session)
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

    const { result } = renderHook(() => useResults('t1', 's1', 'full-game'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toEqual(results), { timeout: 3000 })
  })

  it('asks for the mode in the key, so each mode has its own answer (RES-45)', async () => {
    const urls: string[] = []
    server.use(
      http.get(path, ({ request }) => {
        urls.push(new URL(request.url).search)
        return HttpResponse.json(create())
      }),
    )

    const steady = renderHook(() => useResults('t1', 's1', 'full-game'), { wrapper: wrapper() })
    const live = renderHook(() => useResults('t1', 's1', 'live'), { wrapper: wrapper() })
    await waitFor(() => expect(steady.result.current.isSuccess).toBe(true), { timeout: 3000 })
    await waitFor(() => expect(live.result.current.isSuccess).toBe(true), { timeout: 3000 })

    expect(urls.toSorted()).toEqual(['?mode=full-game', '?mode=live'])
  })

  it('does not poll: the stream tells the page when to ask again (RES-44, D-241)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let count = 0
    server.use(
      http.get(path, () => {
        count += 1
        return HttpResponse.json(create())
      }),
    )
    const { result } = renderHook(() => useResults('t1', 's1', 'full-game'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 })

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

    const { result } = renderHook(() => useResults('t1', 's1', 'full-game'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 })
    expect(calls.count).toBe(1)
  })

  it('retries another failure once', async () => {
    const calls = serveStatus(path, 500)

    const { result } = renderHook(() => useResults('t1', 's1', 'full-game'), { wrapper: wrapper() })

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
