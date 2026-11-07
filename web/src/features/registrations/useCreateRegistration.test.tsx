import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { emptyBowler } from './deskForm'
import { useCreateRegistration } from './useCreateRegistration'
import { registrationKeys } from './useRegistrations'

const request = {
  divisionId: 'd1',
  average: null,
  squadIds: ['s1'],
  sweeperIds: [],
  superSweeper: false,
  bowler: { ...emptyBowler, firstName: 'Maria', lastName: 'Gonzalez' },
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useCreateRegistration('t1'), { wrapper }) }
}

describe('useCreateRegistration (D-157)', () => {
  it('posts to this tournament and refreshes its registration list', async () => {
    let path = ''
    server.use(
      http.post('/v1/tournaments/:id/registrations', ({ request: sent }) => {
        path = new URL(sent.url).pathname
        return HttpResponse.json({ registrationId: 'r1', mode: 'created' }, { status: 201 })
      }),
    )
    const { client, result } = setup()
    client.setQueryData(registrationKeys.list('t1'), { stale: true })

    await act(async () => {
      await result.current.mutateAsync(request)
    })

    expect(path).toBe('/v1/tournaments/t1/registrations')
    await waitFor(() => {
      expect(result.current.data).toEqual({ registrationId: 'r1', mode: 'created' })
    })
    expect(client.getQueryState(registrationKeys.list('t1'))?.isInvalidated).toBe(true)
  })

  it('leaves the list alone when the save fails', async () => {
    server.use(
      http.post('/v1/tournaments/:id/registrations', () => new HttpResponse(null, { status: 500 })),
    )
    const { client, result } = setup()
    client.setQueryData(registrationKeys.list('t1'), { stale: true })

    act(() => {
      result.current.mutate(request)
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(client.getQueryState(registrationKeys.list('t1'))?.isInvalidated).toBe(false)
  })
})
