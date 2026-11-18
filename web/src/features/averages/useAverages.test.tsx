import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createAverageRow } from '../../mocks/data'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { averageKeys, useAverages, useRemoveCheck, useSaveCheck } from './useAverages'

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

describe('averageKeys', () => {
  it('sits under the tournament so one refresh reaches it (AVG-19)', () => {
    expect(averageKeys.list('t1')).toEqual([...tournamentKeys.detail('t1'), 'averages'])
  })
})

describe('useAverages (AVG-02)', () => {
  it('loads the rows', async () => {
    const row = createAverageRow({ bowlerName: 'Maria Chen' })
    server.use(
      http.get('/v1/tournaments/:id/averages', () =>
        HttpResponse.json({ rows: [row], tournamentComplete: false }),
      ),
    )

    const { result } = renderHook(() => useAverages('t1'), {
      wrapper: wrapperFor(new QueryClient()),
    })

    await waitFor(() => {
      expect(result.current.data?.rows[0]?.bowlerName).toBe('Maria Chen')
    })
  })

  it('does not ask again for a tournament that is not there', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id/averages', () => {
        calls += 1
        return new HttpResponse(null, { status: 404 })
      }),
    )

    const { result } = renderHook(() => useAverages('missing'), {
      wrapper: wrapperFor(new QueryClient()),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(calls).toBe(1)
  })
})

describe('useSaveCheck and useRemoveCheck (AVG-03, AVG-07, AVG-19)', () => {
  it('sends the verify and asks for the tournament again', async () => {
    let body: unknown
    server.use(
      http.put(
        '/v1/tournaments/:id/registrations/:registrationId/average-check',
        async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({})
        },
      ),
    )
    const client = new QueryClient()
    const refresh = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useSaveCheck('t1'), { wrapper: wrapperFor(client) })
    await act(async () => {
      await result.current.mutateAsync({
        registrationId: 'r1',
        change: { action: 'verify' },
        confirm: false,
      })
    })

    expect(body).toEqual({ action: 'verify' })
    expect(refresh).toHaveBeenCalledWith({ queryKey: tournamentKeys.detail('t1') })
  })

  it('removes the check and asks for the tournament again', async () => {
    let url = ''
    server.use(
      http.delete(
        '/v1/tournaments/:id/registrations/:registrationId/average-check',
        ({ request }) => {
          url = request.url
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    const client = new QueryClient()
    const refresh = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useRemoveCheck('t1'), { wrapper: wrapperFor(client) })
    await act(async () => {
      await result.current.mutateAsync({ registrationId: 'r1', confirm: true })
    })

    expect(url).toContain('confirmWarnings=true')
    expect(refresh).toHaveBeenCalledWith({ queryKey: tournamentKeys.detail('t1') })
  })
})
