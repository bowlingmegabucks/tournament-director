import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLiveAtLarge, createLiveResults } from '../../mocks/data'
import { server } from '../../mocks/server'
import { FakeEventSource } from '../../test/fakeEventSource'
import { useLiveResults } from './useLiveResults'

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource)
})
afterEach(() => {
  vi.unstubAllGlobals()
  FakeEventSource.instances.length = 0
})

describe('useLiveResults (RES-62)', () => {
  it("flashes nothing on another tournament's first load", async () => {
    const divisionId = '44444444-4444-4444-8444-444444444444'
    server.use(
      http.get('/v1/tournaments/:id/live-results', ({ params }) =>
        HttpResponse.json(
          createLiveResults({
            tournament: { id: String(params.id), name: String(params.id) },
            atLarge: [
              createLiveAtLarge({ divisionId, projected: true, spots: params.id === 'a' ? 5 : 6 }),
            ],
          }),
        ),
      ),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, rerender } = renderHook(({ id }) => useLiveResults(id), {
      initialProps: { id: 'a' },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    })
    await waitFor(() => {
      expect(result.current.data?.tournament.id).toBe('a')
    })

    rerender({ id: 'b' })
    await waitFor(() => {
      expect(result.current.data?.tournament.id).toBe('b')
    })

    expect(result.current.notice).toBeUndefined()
  })
})
