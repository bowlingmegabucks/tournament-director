import { describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { server } from '../../mocks/server'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { registrationKeys } from './useRegistrations'
import { editInfoKeys } from './useEditInfo'
import { useEditRegistration } from './useEditRegistration'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const reads = { list: 0, edit: 0, other: 0 }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    () => ({
      edit: useEditRegistration('t1', 'r1'),
      list: useQuery({
        queryKey: registrationKeys.list('t1'),
        queryFn: () => ++reads.list,
      }),
      read: useQuery({
        queryKey: editInfoKeys.detail('t1', 'r1'),
        queryFn: () => ++reads.edit,
      }),
      other: useQuery({
        queryKey: [...tournamentKeys.detail('t1'), 'squads'],
        queryFn: () => ++reads.other,
      }),
      elsewhere: useQuery({
        queryKey: [...tournamentKeys.detail('t2'), 'squads'],
        queryFn: () => 1,
      }),
    }),
    { wrapper },
  )
  return { ...hook, reads }
}

describe('useEditRegistration (D-197, D-199)', () => {
  it('sends the PATCH to the registration of the tournament', async () => {
    let seen: { path: string; body: unknown } | undefined
    server.use(
      http.patch('/v1/tournaments/t1/registrations/r1', async ({ request }) => {
        seen = { path: new URL(request.url).pathname, body: await request.json() }
        return HttpResponse.json({ registrationId: 'r1', added: 1, removed: 0 })
      }),
    )
    const { result } = setup()

    const saved = await result.current.edit.mutateAsync({ addSquadIds: ['s1'] })

    expect(saved).toEqual({ registrationId: 'r1', added: 1, removed: 0 })
    expect(seen).toEqual({
      path: '/v1/tournaments/t1/registrations/r1',
      body: { addSquadIds: ['s1'] },
    })
  })

  it('refreshes the lists under the tournament but not the edit read itself', async () => {
    server.use(
      http.patch('/v1/tournaments/t1/registrations/r1', () =>
        HttpResponse.json({ registrationId: 'r1', added: 0, removed: 1 }),
      ),
    )
    const { result, reads } = setup()
    await waitFor(() => {
      expect(result.current.list.data).toBe(1)
      expect(result.current.read.data).toBe(1)
      expect(result.current.other.data).toBe(1)
    })

    await result.current.edit.mutateAsync({ removeSquadIds: ['s1'] })

    await waitFor(() => {
      expect(reads.list).toBe(2)
      expect(reads.other).toBe(2)
    })
    expect(reads.edit).toBe(1)
  })

  it('refreshes after a refusal too, since it can mean the page was out of date', async () => {
    server.use(
      http.patch('/v1/tournaments/t1/registrations/r1', () =>
        HttpResponse.json({ message: 'no', errors: {} }, { status: 400 }),
      ),
    )
    const { result, reads } = setup()
    await waitFor(() => {
      expect(result.current.list.data).toBe(1)
    })

    await expect(result.current.edit.mutateAsync({})).rejects.toThrow()

    await waitFor(() => {
      expect(reads.list).toBe(2)
    })
    expect(reads.edit).toBe(1)
  })
})
