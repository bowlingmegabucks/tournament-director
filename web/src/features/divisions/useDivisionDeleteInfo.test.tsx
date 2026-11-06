import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { useDivisionDeleteInfo } from './useDivisionDeleteInfo'

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

describe('useDivisionDeleteInfo', () => {
  it('loads the registration and sweeper counts of the division (D-154)', async () => {
    server.use(
      http.get('/v1/tournaments/:id/divisions/:divisionId/delete-info', () =>
        HttpResponse.json({ deleteInfo: { registrationCount: 4, sweeperCount: 2 } }),
      ),
    )

    const { result } = renderHook(() => useDivisionDeleteInfo('t1', 'd1'), {
      wrapper: wrapperFor(new QueryClient()),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual({ registrationCount: 4, sweeperCount: 2 })
    })
  })

  it('reports an unknown division as not found, without a retry', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id/divisions/:divisionId/delete-info', () => {
        calls += 1
        return HttpResponse.json({ message: 'Division not found' }, { status: 404 })
      }),
    )

    const { result } = renderHook(() => useDivisionDeleteInfo('t1', 'nope'), {
      wrapper: wrapperFor(new QueryClient()),
    })

    await waitFor(() => {
      expect(result.current.error?.message).toBe(
        'This division was not found. It may have been removed.',
      )
    })
    expect(calls).toBe(1)
  })

  it('forgets the answer once nothing reads it, so the next open asks again (D-154)', async () => {
    let counts = 1
    server.use(
      http.get('/v1/tournaments/:id/divisions/:divisionId/delete-info', () =>
        HttpResponse.json({ deleteInfo: { registrationCount: counts, sweeperCount: 0 } }),
      ),
    )
    const client = new QueryClient()
    const first = renderHook(() => useDivisionDeleteInfo('t1', 'd1'), {
      wrapper: wrapperFor(client),
    })
    await waitFor(() => {
      expect(first.result.current.data?.registrationCount).toBe(1)
    })
    first.unmount()
    await waitFor(() => {
      expect(client.getQueryCache().getAll()).toHaveLength(0)
    })
    counts = 5

    const second = renderHook(() => useDivisionDeleteInfo('t1', 'd1'), {
      wrapper: wrapperFor(client),
    })

    expect(second.result.current.data).toBeUndefined()
    await waitFor(() => {
      expect(second.result.current.data?.registrationCount).toBe(5)
    })
  })
})
