import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createDivision } from '../../mocks/data'
import { useCreateDivision } from './useCreateDivision'
import { divisionKeys } from './useDivisions'

const input = {
  name: 'Open',
  gender: null,
  minimumAge: null,
  maximumAge: null,
  minimumAverage: null,
  maximumAverage: null,
  handicapPercentage: null,
  handicapBase: null,
  maximumHandicapPerGame: null,
} as const

describe('useCreateDivision', () => {
  it("marks that tournament's division list stale once the division is saved (DIV-12)", async () => {
    server.use(
      http.post('/v1/tournaments/:id/divisions', () =>
        HttpResponse.json({ division: createDivision() }, { status: 201 }),
      ),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(divisionKeys.list('t1'), [createDivision()])
    client.setQueryData(divisionKeys.list('t2'), [createDivision()])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCreateDivision('t1'), { wrapper })

    result.current.mutate({ input, confirmWarnings: false })

    await waitFor(() => {
      expect(client.getQueryState(divisionKeys.list('t1'))?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(divisionKeys.list('t2'))?.isInvalidated).toBe(false)
  })
})
