import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { useCompleteTournament } from './useCompleteTournament'

const path = '/v1/tournaments/:id/complete'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = (id: string) => [...tournamentKeys.detail(id), 'squads']
  client.setQueryData(key('t1'), [])
  client.setQueryData(key('t2'), [])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useCompleteTournament('t1'), { wrapper })
  return { client, key, result }
}

describe('useCompleteTournament (TRN-38, D-260)', () => {
  it("marks that tournament's data stale once it is completed, and no other tournament's", async () => {
    let completed: unknown
    server.use(
      http.post(path, ({ params }) => {
        completed = params
        return HttpResponse.json({
          completed: true,
          squadsCompleted: 1,
          sweepersCompleted: 0,
          noShowCount: 0,
        })
      }),
    )
    const { client, key, result } = setup()

    result.current.mutate()

    await waitFor(() => {
      expect(client.getQueryState(key('t1'))?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(key('t2'))?.isInvalidated).toBe(false)
    expect(completed).toEqual({ id: 't1' })
  })

  it('refreshes when the complete is refused, since the page was out of date (D-257)', async () => {
    server.use(
      http.post(path, () =>
        HttpResponse.json({ message: 'No', errors: { tournament: 'No' } }, { status: 409 }),
      ),
    )
    const { client, key, result } = setup()

    result.current.mutate()

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    await waitFor(() => {
      expect(client.getQueryState(key('t1'))?.isInvalidated).toBe(true)
    })
  })
})
