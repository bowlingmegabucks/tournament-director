import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSweeper } from '../../mocks/data'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { sweeperKeys } from './useSweepers'
import { useUpdateSweeper } from './useUpdateSweeper'

describe('useUpdateSweeper', () => {
  it("marks that tournament's reads stale once the sweeper is saved, and no other tournament's (SQD-23)", async () => {
    server.use(
      http.patch('/v1/tournaments/:id/sweepers/:sessionId', () =>
        HttpResponse.json({ sweeper: createSweeper() }),
      ),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(sweeperKeys.list('t1'), [createSweeper()])
    client.setQueryData(tournamentKeys.detail('t1'), { id: 't1' })
    client.setQueryData(sweeperKeys.list('t2'), [createSweeper()])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useUpdateSweeper('t1', 's1'), { wrapper })

    result.current.mutate({ changes: { games: 4 }, confirmWarnings: false })

    await waitFor(() => {
      expect(client.getQueryState(sweeperKeys.list('t1'))?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(tournamentKeys.detail('t1'))?.isInvalidated).toBe(true)
    expect(client.getQueryState(sweeperKeys.list('t2'))?.isInvalidated).toBe(false)
  })

  it('sends the changes with confirmWarnings when told to', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch('/v1/tournaments/:id/sweepers/:sessionId', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ sweeper: createSweeper() })
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useUpdateSweeper('t1', 's1'), { wrapper })

    result.current.mutate({ changes: { games: 4 }, confirmWarnings: true })

    await waitFor(() => {
      expect(bodies).toEqual([{ games: 4, confirmWarnings: true }])
    })
  })
})
