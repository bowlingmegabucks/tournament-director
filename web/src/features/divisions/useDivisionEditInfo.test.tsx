import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { useDivisionEditInfo } from './useDivisionEditInfo'

function setup() {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return wrapper
}

describe('useDivisionEditInfo', () => {
  it('loads the registration count and score flag of the division (DIV-12)', async () => {
    server.use(
      http.get('/v1/tournaments/:id/divisions/:divisionId/edit-info', () =>
        HttpResponse.json({ editInfo: { registrationCount: 4, hasScores: true } }),
      ),
    )

    const { result } = renderHook(() => useDivisionEditInfo('t1', 'd1'), {
      wrapper: setup(),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual({ registrationCount: 4, hasScores: true })
    })
  })

  it('does not retry an unknown division', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id/divisions/:divisionId/edit-info', () => {
        calls += 1
        return HttpResponse.json({ message: 'Division not found' }, { status: 404 })
      }),
    )

    const { result } = renderHook(() => useDivisionEditInfo('t1', 'nope'), {
      wrapper: setup(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(calls).toBe(1)
  })
})
