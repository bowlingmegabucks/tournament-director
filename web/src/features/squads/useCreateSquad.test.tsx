import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSquad } from '../../mocks/data'
import { useCreateSquad } from './useCreateSquad'
import { squadKeys } from './useSquads'

const input = {
  date: '2026-10-24T09:00',
  startingLane: 1,
  numberOfLanes: 24,
  maxPerPair: 4,
  entryFee: null,
  finalsRatio: null,
  cashRatio: null,
} as const

describe('useCreateSquad', () => {
  it("marks that tournament's squad list stale once the squad is saved (SQD-01)", async () => {
    server.use(
      http.post('/v1/tournaments/:id/squads', () =>
        HttpResponse.json({ squad: createSquad() }, { status: 201 }),
      ),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(squadKeys.list('t1'), [createSquad()])
    client.setQueryData(squadKeys.list('t2'), [createSquad()])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCreateSquad('t1'), { wrapper })

    result.current.mutate(input)

    await waitFor(() => {
      expect(client.getQueryState(squadKeys.list('t1'))?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(squadKeys.list('t2'))?.isInvalidated).toBe(false)
  })
})
