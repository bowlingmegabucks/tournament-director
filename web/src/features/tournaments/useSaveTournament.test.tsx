import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createTournament } from '../../mocks/data'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { toNewTournament } from './validateTournament'
import { useCreateTournament } from './useCreateTournament'
import { useUpdateTournament } from './useUpdateTournament'

function setup<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const list = [...tournamentKeys.all, 'list']
  const settings = [...tournamentKeys.detail('t1'), 'settings']
  client.setQueryData(list, [])
  client.setQueryData(settings, {})
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(hook, { wrapper })
  return { client, list, settings, result }
}

describe('useCreateTournament (TRN-22)', () => {
  it('marks every tournament query stale once the tournament is saved', async () => {
    const stored = createTournament()
    server.use(
      http.post('/v1/tournaments', () =>
        HttpResponse.json({ tournament: stored }, { status: 201 }),
      ),
    )
    const { client, list, settings, result } = setup(useCreateTournament)

    result.current.mutate(
      toNewTournament({
        name: 'Spring',
        startDate: '2027-03-12',
        endDate: '2027-03-14',
        bowlingCenter: 'Bowl-O-Rama',
        entryFee: '60',
        games: '5',
        finalsRatio: '8',
        cashRatio: '5',
        superSweeperCashRatio: '4',
      }),
    )

    await waitFor(() => {
      expect(client.getQueryState(list)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(settings)?.isInvalidated).toBe(true)
  })
})

describe('useUpdateTournament (TRN-24, TRN-29)', () => {
  it('marks every tournament query stale once the changes are saved', async () => {
    const stored = createTournament()
    server.use(http.patch('/v1/tournaments/t1', () => HttpResponse.json({ tournament: stored })))
    const { client, list, settings, result } = setup(() => useUpdateTournament('t1'))

    result.current.mutate({ name: 'Renamed' })

    await waitFor(() => {
      expect(client.getQueryState(list)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(settings)?.isInvalidated).toBe(true)
  })

  it('leaves the queries alone when the save fails', async () => {
    server.use(http.patch('/v1/tournaments/t1', () => new HttpResponse(null, { status: 500 })))
    const { client, list, result } = setup(() => useUpdateTournament('t1'))

    result.current.mutate({ name: 'Renamed' })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(client.getQueryState(list)?.isInvalidated).toBe(false)
  })
})
