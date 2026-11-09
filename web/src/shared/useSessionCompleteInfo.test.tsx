import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { useSessionCompleteInfo } from './useSessionCompleteInfo'

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

describe('useSessionCompleteInfo (D-194)', () => {
  it('loads the counts of the squad', async () => {
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/complete-info', () =>
        HttpResponse.json({
          completeInfo: { entryCount: 4, noScoreCount: 1, partialCount: 0, games: 3 },
        }),
      ),
    )

    const { result } = renderHook(() => useSessionCompleteInfo('squads', 't1', 's1'), {
      wrapper: wrapperFor(new QueryClient()),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual({
        entryCount: 4,
        noScoreCount: 1,
        partialCount: 0,
        games: 3,
      })
    })
  })

  it('loads a sweeper from its own path', async () => {
    server.use(
      http.get('/v1/tournaments/:id/sweepers/:sessionId/complete-info', () =>
        HttpResponse.json({ completeInfo: { entryCount: 7 } }),
      ),
    )

    const { result } = renderHook(() => useSessionCompleteInfo('sweepers', 't1', 's1'), {
      wrapper: wrapperFor(new QueryClient()),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual({ entryCount: 7 })
    })
  })

  it('reports an unknown session without a retry', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/complete-info', () => {
        calls += 1
        return HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
      }),
    )

    const { result } = renderHook(() => useSessionCompleteInfo('squads', 't1', 'nope'), {
      wrapper: wrapperFor(new QueryClient()),
    })

    await waitFor(() => {
      expect(result.current.error?.message).toBe(
        'This squad was not found. It may have been removed.',
      )
    })
    expect(calls).toBe(1)
  })

  it('drops the answer when nothing uses it, so the next open reads fresh counts', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/complete-info', () => {
        calls += 1
        return HttpResponse.json({
          completeInfo: { entryCount: calls, noScoreCount: 0, partialCount: 0, games: 3 },
        })
      }),
    )
    const client = new QueryClient()
    const first = renderHook(() => useSessionCompleteInfo('squads', 't1', 's1'), {
      wrapper: wrapperFor(client),
    })
    await waitFor(() => {
      expect(first.result.current.data?.entryCount).toBe(1)
    })
    first.unmount()

    const second = renderHook(() => useSessionCompleteInfo('squads', 't1', 's1'), {
      wrapper: wrapperFor(client),
    })

    await waitFor(() => {
      expect(second.result.current.data?.entryCount).toBe(2)
    })
  })
})
