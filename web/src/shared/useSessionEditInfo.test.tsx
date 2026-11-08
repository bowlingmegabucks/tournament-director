import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { useSessionEditInfo } from './useSessionEditInfo'

const info = {
  entryCount: 4,
  assignmentCount: 2,
  hasScores: false,
  lowestAssignedLane: 3,
  highestAssignedLane: 6,
  fullestPair: 2,
}

function setup(defaults: { staleTime?: number } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, ...defaults } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useSessionEditInfo (SQD-26)', () => {
  it('loads what depends on a squad', async () => {
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/edit-info', () =>
        HttpResponse.json({ editInfo: info }),
      ),
    )
    const { wrapper } = setup()

    const { result } = renderHook(() => useSessionEditInfo('squads', 't1', 's1'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual(info)
    })
  })

  it('loads what depends on a sweeper from the sweeper route', async () => {
    server.use(
      http.get('/v1/tournaments/:id/sweepers/:sessionId/edit-info', () =>
        HttpResponse.json({ editInfo: { ...info, hasScores: true } }),
      ),
    )
    const { wrapper } = setup()

    const { result } = renderHook(() => useSessionEditInfo('sweepers', 't1', 's1'), { wrapper })

    await waitFor(() => {
      expect(result.current.data?.hasScores).toBe(true)
    })
  })

  it('does not retry a 404', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/edit-info', () => {
        calls += 1
        return new HttpResponse(null, { status: 404 })
      }),
    )
    const { wrapper } = setup()

    const { result } = renderHook(() => useSessionEditInfo('squads', 't1', 's1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(calls).toBe(1)
  })

  it('keeps each session under its own key', async () => {
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/edit-info', ({ params }) =>
        HttpResponse.json({
          editInfo: { ...info, entryCount: params.sessionId === 's1' ? 1 : 9 },
        }),
      ),
    )
    const { wrapper } = setup()

    const one = renderHook(() => useSessionEditInfo('squads', 't1', 's1'), { wrapper })
    const two = renderHook(() => useSessionEditInfo('squads', 't1', 's2'), { wrapper })

    await waitFor(() => {
      expect(one.result.current.data?.entryCount).toBe(1)
      expect(two.result.current.data?.entryCount).toBe(9)
    })
  })

  it('retries a server error once, then fails', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/edit-info', () => {
        calls += 1
        return new HttpResponse(null, { status: 500 })
      }),
    )
    const { wrapper } = setup()

    const { result } = renderHook(() => useSessionEditInfo('squads', 't1', 's1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(calls).toBe(2)
  })

  it('refetches on mount when asked to, even for fresh data', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/edit-info', () => {
        calls += 1
        return HttpResponse.json({ editInfo: { ...info, entryCount: calls } })
      }),
    )
    const { wrapper } = setup({ staleTime: Infinity })
    const first = renderHook(() => useSessionEditInfo('squads', 't1', 's1'), { wrapper })
    await waitFor(() => {
      expect(first.result.current.data?.entryCount).toBe(1)
    })

    const second = renderHook(
      () => useSessionEditInfo('squads', 't1', 's1', { refetchOnMount: 'always' }),
      { wrapper },
    )

    await waitFor(() => {
      expect(second.result.current.data?.entryCount).toBe(2)
    })
  })

  it('does not refetch fresh data on mount by default', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/edit-info', () => {
        calls += 1
        return HttpResponse.json({ editInfo: info })
      }),
    )
    const { wrapper } = setup({ staleTime: Infinity })
    const first = renderHook(() => useSessionEditInfo('squads', 't1', 's1'), { wrapper })
    await waitFor(() => {
      expect(first.result.current.data).toEqual(info)
    })

    const second = renderHook(() => useSessionEditInfo('squads', 't1', 's1'), { wrapper })

    expect(second.result.current.data).toEqual(info)
    expect(calls).toBe(1)
  })
})
