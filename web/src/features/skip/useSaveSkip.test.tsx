import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { server } from '../../mocks/server'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { useSaveSkip } from './useSaveSkip'

function setup(kind: 'squad' | 'sweeper' = 'squad') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useSaveSkip(kind, 't1', 's1'), { wrapper }) }
}

describe('useSaveSkip (SCR-23, D-235)', () => {
  it('saves, then marks every read of the session stale', async () => {
    server.use(
      http.put('/v1/tournaments/t1/squads/s1/skip', () => HttpResponse.json({ skip: 'same' })),
    )
    const { client, result } = setup()
    const lanes = [...tournamentKeys.detail('t1'), 'squads', 's1', 'lanes']
    const other = [...tournamentKeys.detail('t1'), 'squads', 's2', 'lanes']
    client.setQueryData(lanes, 'x')
    client.setQueryData(other, 'y')

    await act(async () => {
      await result.current.mutateAsync('same')
    })

    expect(client.getQueryState(lanes)?.isInvalidated).toBe(true)
    expect(client.getQueryState(other)?.isInvalidated).toBe(false)
  })

  it('invalidates the sweeper reads for a sweeper', async () => {
    server.use(
      http.put('/v1/tournaments/t1/sweepers/s1/skip', () => HttpResponse.json({ skip: 'same' })),
    )
    const { client, result } = setup('sweeper')
    const lanes = [...tournamentKeys.detail('t1'), 'sweepers', 's1', 'lanes']
    const squad = [...tournamentKeys.detail('t1'), 'squads', 's1', 'lanes']
    client.setQueryData(lanes, 'x')
    client.setQueryData(squad, 'y')

    await act(async () => {
      await result.current.mutateAsync('same')
    })

    expect(client.getQueryState(lanes)?.isInvalidated).toBe(true)
    expect(client.getQueryState(squad)?.isInvalidated).toBe(false)
  })

  it('does not invalidate when the save fails', async () => {
    server.use(
      http.put('/v1/tournaments/t1/squads/s1/skip', () => new HttpResponse(null, { status: 500 })),
    )
    const { client, result } = setup()
    const lanes = [...tournamentKeys.detail('t1'), 'squads', 's1', 'lanes']
    client.setQueryData(lanes, 'x')

    await act(async () => {
      await result.current.mutateAsync('same').catch(() => undefined)
    })

    expect(client.getQueryState(lanes)?.isInvalidated).toBe(false)
  })
})
