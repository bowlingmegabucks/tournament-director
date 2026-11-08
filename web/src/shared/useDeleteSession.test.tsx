import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { tournamentKeys } from './tournamentQuery'
import { useDeleteSession } from './useDeleteSession'

function setup(kind: 'squads' | 'sweepers') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = (tournamentId: string) => [...tournamentKeys.detail(tournamentId), kind]
  client.setQueryData(key('t1'), [])
  client.setQueryData(key('t2'), [])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useDeleteSession(kind, 't1'), { wrapper })
  return { client, key, result }
}

describe.each(['squads', 'sweepers'] as const)('useDeleteSession, %s', (kind) => {
  const path = `/v1/tournaments/:id/${kind}/:sessionId`

  it("marks that tournament's data stale once the session is deleted, and no other tournament's (SQD-14)", async () => {
    let deleted: unknown
    server.use(
      http.delete(path, ({ params }) => {
        deleted = params
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { client, key, result } = setup(kind)

    result.current.mutate('s1')

    await waitFor(() => {
      expect(client.getQueryState(key('t1'))?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(key('t2'))?.isInvalidated).toBe(false)
    expect(deleted).toEqual({ id: 't1', sessionId: 's1' })
  })

  it('refreshes when the delete is refused, since the page was out of date (D-186)', async () => {
    server.use(
      http.delete(path, () =>
        HttpResponse.json({ message: 'No', errors: { entries: 'No' } }, { status: 409 }),
      ),
    )
    const { client, key, result } = setup(kind)

    result.current.mutate('s1')

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    await waitFor(() => {
      expect(client.getQueryState(key('t1'))?.isInvalidated).toBe(true)
    })
  })

  it('refreshes when the session is already gone (404)', async () => {
    server.use(http.delete(path, () => new HttpResponse(null, { status: 404 })))
    const { client, key, result } = setup(kind)

    result.current.mutate('s1')

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    await waitFor(() => {
      expect(client.getQueryState(key('t1'))?.isInvalidated).toBe(true)
    })
  })
})
