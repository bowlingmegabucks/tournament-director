import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSquad } from '../../mocks/data'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { squadKeys } from './useSquads'
import { useUpdateSquad } from './useUpdateSquad'

describe('useUpdateSquad', () => {
  it("marks that tournament's reads stale once the squad is saved, and no other tournament's (SQD-23)", async () => {
    server.use(
      http.patch('/v1/tournaments/:id/squads/:sessionId', () =>
        HttpResponse.json({ squad: createSquad() }),
      ),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(squadKeys.list('t1'), [createSquad()])
    client.setQueryData(tournamentKeys.detail('t1'), { id: 't1' })
    client.setQueryData(squadKeys.list('t2'), [createSquad()])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useUpdateSquad('t1', 's1'), { wrapper })

    result.current.mutate({ changes: { maxPerPair: 3 }, confirmWarnings: false })

    await waitFor(() => {
      expect(client.getQueryState(squadKeys.list('t1'))?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(tournamentKeys.detail('t1'))?.isInvalidated).toBe(true)
    expect(client.getQueryState(squadKeys.list('t2'))?.isInvalidated).toBe(false)
  })

  it('sends the changes with confirmWarnings when told to', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch('/v1/tournaments/:id/squads/:sessionId', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ squad: createSquad() })
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useUpdateSquad('t1', 's1'), { wrapper })

    result.current.mutate({ changes: { maxPerPair: 3 }, confirmWarnings: true })

    await waitFor(() => {
      expect(bodies).toEqual([{ maxPerPair: 3, confirmWarnings: true }])
    })
  })
})
