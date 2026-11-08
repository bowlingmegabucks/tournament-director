import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { useSessionDeleteInfo } from './useSessionDeleteInfo'

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

describe('useSessionDeleteInfo', () => {
  it('loads the entry and score counts of the squad (D-188)', async () => {
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/delete-info', () =>
        HttpResponse.json({ deleteInfo: { entryCount: 4, scoreCount: 2 } }),
      ),
    )

    const { result } = renderHook(() => useSessionDeleteInfo('squads', 't1', 's1'), {
      wrapper: wrapperFor(new QueryClient()),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual({ entryCount: 4, scoreCount: 2 })
    })
  })

  it('loads a sweeper from its own path (D-188)', async () => {
    server.use(
      http.get('/v1/tournaments/:id/sweepers/:sessionId/delete-info', () =>
        HttpResponse.json({ deleteInfo: { entryCount: 0, scoreCount: 9 } }),
      ),
    )

    const { result } = renderHook(() => useSessionDeleteInfo('sweepers', 't1', 's1'), {
      wrapper: wrapperFor(new QueryClient()),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual({ entryCount: 0, scoreCount: 9 })
    })
  })

  it('reports an unknown session as not found, without a retry', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/delete-info', () => {
        calls += 1
        return HttpResponse.json({ message: 'Squad not found' }, { status: 404 })
      }),
    )

    const { result } = renderHook(() => useSessionDeleteInfo('squads', 't1', 'nope'), {
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
      http.get('/v1/tournaments/:id/squads/:sessionId/delete-info', () => {
        calls += 1
        return HttpResponse.json({ deleteInfo: { entryCount: calls, scoreCount: 0 } })
      }),
    )
    const client = new QueryClient()
    const first = renderHook(() => useSessionDeleteInfo('squads', 't1', 's1'), {
      wrapper: wrapperFor(client),
    })
    await waitFor(() => {
      expect(first.result.current.data).toEqual({ entryCount: 1, scoreCount: 0 })
    })
    first.unmount()

    const second = renderHook(() => useSessionDeleteInfo('squads', 't1', 's1'), {
      wrapper: wrapperFor(client),
    })

    await waitFor(() => {
      expect(second.result.current.data).toEqual({ entryCount: 2, scoreCount: 0 })
    })
  })
})
