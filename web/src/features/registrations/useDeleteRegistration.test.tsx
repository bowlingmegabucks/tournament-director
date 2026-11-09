import { describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { server } from '../../mocks/server'
import { tournamentKeys } from '../../shared/tournamentQuery'
import { deleteInfoKeys } from './useDeleteInfo'
import { editInfoKeys } from './useEditInfo'
import { useDeleteRegistration } from './useDeleteRegistration'
import { registrationKeys } from './useRegistrations'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const reads = { list: 0, edit: 0, info: 0, other: 0 }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    () => ({
      remove: useDeleteRegistration('t1', 'r1'),
      list: useQuery({ queryKey: registrationKeys.list('t1'), queryFn: () => ++reads.list }),
      edit: useQuery({ queryKey: editInfoKeys.detail('t1', 'r1'), queryFn: () => ++reads.edit }),
      info: useQuery({
        queryKey: deleteInfoKeys.detail('t1', 'r1'),
        queryFn: () => ++reads.info,
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

describe('useDeleteRegistration (REG-19, D-209)', () => {
  it('sends the DELETE to the registration of the tournament, with the confirmed total', async () => {
    let seen = ''
    server.use(
      http.delete('/v1/tournaments/t1/registrations/r1', ({ request }) => {
        const url = new URL(request.url)
        seen = `${url.pathname}${url.search}`
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { result } = setup()

    await result.current.remove.mutateAsync(85)

    expect(seen).toBe('/v1/tournaments/t1/registrations/r1?confirmWarnings=true&paid=85.00')
  })

  it('refreshes the lists under the tournament but not the reads of this registration', async () => {
    server.use(
      http.delete(
        '/v1/tournaments/t1/registrations/r1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    const { result, reads } = setup()
    await waitFor(() => {
      expect(result.current.list.data).toBe(1)
      expect(result.current.edit.data).toBe(1)
      expect(result.current.info.data).toBe(1)
      expect(result.current.other.data).toBe(1)
    })

    await result.current.remove.mutateAsync(undefined)

    await waitFor(() => {
      expect(reads.list).toBe(2)
      expect(reads.other).toBe(2)
    })
    expect(reads.edit).toBe(1)
    expect(reads.info).toBe(1)
  })

  it('refreshes nothing after a refusal: the registration is still there', async () => {
    server.use(
      http.delete('/v1/tournaments/t1/registrations/r1', () =>
        HttpResponse.json({ message: 'no', errors: { scores: 'no' } }, { status: 409 }),
      ),
    )
    const { result, reads } = setup()
    await waitFor(() => {
      expect(result.current.list.data).toBe(1)
    })

    await expect(result.current.remove.mutateAsync(undefined)).rejects.toThrow()

    expect(reads.list).toBe(1)
  })
})
