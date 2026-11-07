import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSweeper } from '../../mocks/data'
import { useCreateSweeper } from './useCreateSweeper'
import { sweeperKeys } from './useSweepers'

const input = {
  date: '2026-10-24T18:00',
  startingLane: 1,
  numberOfLanes: 24,
  maxPerPair: 4,
  entryFee: 20,
  games: 3,
  cashRatio: 5,
  bonusPins: {},
} as const

describe('useCreateSweeper', () => {
  it("marks that tournament's sweeper list stale once the sweeper is saved (SQD-10)", async () => {
    server.use(
      http.post('/v1/tournaments/:id/sweepers', () =>
        HttpResponse.json({ sweeper: createSweeper() }, { status: 201 }),
      ),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(sweeperKeys.list('t1'), [createSweeper()])
    client.setQueryData(sweeperKeys.list('t2'), [createSweeper()])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCreateSweeper('t1'), { wrapper })

    result.current.mutate(input)

    await waitFor(() => {
      expect(client.getQueryState(sweeperKeys.list('t1'))?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(sweeperKeys.list('t2'))?.isInvalidated).toBe(false)
  })
})
