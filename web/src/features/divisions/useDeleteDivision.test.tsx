import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createDivision } from '../../mocks/data'
import { useDeleteDivision } from './useDeleteDivision'
import { divisionKeys } from './useDivisions'

describe('useDeleteDivision', () => {
  it("marks that tournament's divisions stale once the division is deleted, and no other tournament's (DIV-12)", async () => {
    let deleted: unknown
    server.use(
      http.delete('/v1/tournaments/:id/divisions/:divisionId', ({ params }) => {
        deleted = params
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(divisionKeys.list('t1'), [createDivision()])
    client.setQueryData(divisionKeys.list('t2'), [createDivision()])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useDeleteDivision('t1'), { wrapper })

    result.current.mutate('d1')

    await waitFor(() => {
      expect(client.getQueryState(divisionKeys.list('t1'))?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(divisionKeys.list('t2'))?.isInvalidated).toBe(false)
    expect(deleted).toEqual({ id: 't1', divisionId: 'd1' })
  })

  it('refreshes the lists when the delete is refused, since the page was out of date', async () => {
    server.use(
      http.delete('/v1/tournaments/:id/divisions/:divisionId', () =>
        HttpResponse.json({ message: 'No', errors: { division: 'No' } }, { status: 409 }),
      ),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(divisionKeys.list('t1'), [createDivision()])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useDeleteDivision('t1'), { wrapper })

    result.current.mutate('d1')

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    await waitFor(() => {
      expect(client.getQueryState(divisionKeys.list('t1'))?.isInvalidated).toBe(true)
    })
  })

  it('refreshes the lists when the division is already gone (404)', async () => {
    server.use(
      http.delete('/v1/tournaments/:id/divisions/:divisionId', () =>
        HttpResponse.json({ message: 'Division not found' }, { status: 404 }),
      ),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(divisionKeys.list('t1'), [createDivision()])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useDeleteDivision('t1'), { wrapper })

    result.current.mutate('d1')

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    await waitFor(() => {
      expect(client.getQueryState(divisionKeys.list('t1'))?.isInvalidated).toBe(true)
    })
  })
})
