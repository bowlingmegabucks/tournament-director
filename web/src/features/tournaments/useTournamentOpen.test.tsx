import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSettings } from '../../mocks/data'
import { useTournamentOpen } from './useTournamentOpen'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useTournamentOpen('t1'), { wrapper }) }
}

describe('useTournamentOpen', () => {
  it('is false while the settings load, then true for an open tournament (D-19)', async () => {
    server.use(
      http.get('/v1/tournaments/:id/settings', () =>
        HttpResponse.json({ settings: createSettings({ completed: false }) }),
      ),
    )
    const { result } = setup()

    expect(result.current).toBe(false)
    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('stays false for a complete tournament (D-149, D-171)', async () => {
    server.use(
      http.get('/v1/tournaments/:id/settings', () =>
        HttpResponse.json({ settings: createSettings({ completed: true }) }),
      ),
    )
    const { result, client } = setup()

    await waitFor(() => {
      expect(client.getQueryCache().findAll()[0]?.state.status).toBe('success')
    })
    expect(result.current).toBe(false)
  })

  it('is true when the settings fail, so a slow start keeps the link', async () => {
    server.use(
      http.get('/v1/tournaments/:id/settings', () =>
        HttpResponse.json({ message: 'Boom' }, { status: 500 }),
      ),
    )
    const { result } = setup()

    // The query retries once, one second later, before it counts as failed.
    await waitFor(
      () => {
        expect(result.current).toBe(true)
      },
      { timeout: 3000 },
    )
  })
})
