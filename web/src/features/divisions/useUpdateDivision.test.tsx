import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createDivision } from '../../mocks/data'
import { useUpdateDivision } from './useUpdateDivision'
import { divisionKeys } from './useDivisions'

describe('useUpdateDivision', () => {
  it("marks that tournament's divisions stale once the division is saved, and no other tournament's (DIV-12)", async () => {
    server.use(
      http.patch('/v1/tournaments/:id/divisions/:divisionId', () =>
        HttpResponse.json({ division: createDivision() }),
      ),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(divisionKeys.list('t1'), [createDivision()])
    client.setQueryData(divisionKeys.list('t2'), [createDivision()])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useUpdateDivision('t1', 'd1'), { wrapper })

    result.current.mutate({ changes: { name: 'Main' }, confirmWarnings: false })

    await waitFor(() => {
      expect(client.getQueryState(divisionKeys.list('t1'))?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(divisionKeys.list('t2'))?.isInvalidated).toBe(false)
  })
})
