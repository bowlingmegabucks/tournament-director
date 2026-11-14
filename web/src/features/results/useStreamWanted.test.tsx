import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSettings } from '../../mocks/data'
import { server } from '../../mocks/server'
import { useStreamWanted } from './useStreamWanted'

function setup(complete: boolean | undefined, tournamentComplete: boolean) {
  server.use(
    http.get('/v1/tournaments/:id/settings', () =>
      HttpResponse.json({ settings: createSettings({ completed: tournamentComplete }) }),
    ),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useStreamWanted('t1', complete), { wrapper })
}

function showTab(state: 'visible' | 'hidden') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useStreamWanted (RES-44, D-285)', () => {
  it('waits for the first answer', () => {
    expect(setup(undefined, false).result.current).toBe(false)
  })

  it('follows an open session even in a hidden tab', () => {
    showTab('hidden')

    expect(setup(false, false).result.current).toBe(true)
  })

  it('follows a complete session while the tournament is open and the tab is in front', async () => {
    const { result } = setup(true, false)

    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('lets a complete session go while its tab is hidden, and takes it back on return', async () => {
    const { result } = setup(true, false)
    await waitFor(() => {
      expect(result.current).toBe(true)
    })

    showTab('hidden')
    expect(result.current).toBe(false)

    showTab('visible')
    expect(result.current).toBe(true)
  })

  it('does not follow a complete session of a complete tournament', async () => {
    const { result } = setup(true, true)

    // The settings load, and still the answer is no: nothing can change any more.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(result.current).toBe(false)
  })
})
