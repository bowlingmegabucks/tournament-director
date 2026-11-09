import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLaneBowler } from '../../mocks/data'
import { FakeEventSource } from '../../test/fakeEventSource'
import { filled, serve, tournament } from './lanesTestSupport'
import { useLanes } from './useLanes'
import { UPDATED_MS, useSessionEvents } from './useSessionEvents'

function setup(options: { enabled?: boolean; kind?: 'squad' | 'sweeper' } = {}) {
  const page = filled()
  const api = serve(page)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const kind = options.kind ?? 'squad'
  const view = renderHook(
    ({ session, enabled }) => {
      const lanes = useLanes(kind, tournament.id, session)
      return { lanes, events: useSessionEvents(kind, tournament.id, session, enabled) }
    },
    { wrapper, initialProps: { session: page.session.id, enabled: options.enabled ?? true } },
  )
  return { ...view, api, page, client }
}

afterEach(() => {
  vi.useRealTimers()
  vi.stubGlobal('EventSource', FakeEventSource)
})

describe('useSessionEvents (LAN-19, D-217, D-218)', () => {
  it('opens the stream of the session with the cookie, and is live once it connects', async () => {
    const { result, page } = setup()
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1)
    })
    const stream = FakeEventSource.latest()

    expect(stream.url).toBe(`/v1/tournaments/${tournament.id}/squads/${page.session.id}/events`)
    expect(stream.withCredentials).toBe(true)
    expect(result.current.events.state).toBe('reconnecting')

    act(() => {
      stream.open()
    })

    expect(result.current.events.state).toBe('live')
  })

  it('asks the sweeper path for a sweeper', async () => {
    const { page } = setup({ kind: 'sweeper' })
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1)
    })
    expect(FakeEventSource.latest().url).toBe(
      `/v1/tournaments/${tournament.id}/sweepers/${page.session.id}/events`,
    )
  })

  it('opens nothing while disabled (a complete session needs no stream, D-10)', () => {
    const { result } = setup({ enabled: false })
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(result.current.events.state).toBe('off')
  })

  it('is off, and does not throw, in a browser with no EventSource', () => {
    vi.stubGlobal('EventSource', undefined)
    const { result } = setup()
    expect(result.current.events.state).toBe('off')
  })

  it('closes the stream when the page leaves, and when the session changes', async () => {
    const { unmount, rerender, page } = setup()
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1)
    })
    const first = FakeEventSource.latest()

    rerender({ session: 'another-session', enabled: true })
    expect(first.readyState).toBe(FakeEventSource.CLOSED)
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(2)
    })
    expect(FakeEventSource.latest().url).toContain('/squads/another-session/events')

    unmount()
    expect(FakeEventSource.latest().readyState).toBe(FakeEventSource.CLOSED)
    expect(page.session.id).not.toBe('another-session')
  })

  it('closes the stream when the session turns complete', async () => {
    const { rerender, page } = setup()
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1)
    })

    rerender({ session: page.session.id, enabled: false })

    expect(FakeEventSource.latest().readyState).toBe(FakeEventSource.CLOSED)
  })

  it('refetches the page on a changed message, and says what changed (D-218)', async () => {
    const { result, api } = setup()
    await waitFor(() => {
      expect(result.current.lanes.data).toBeDefined()
    })
    act(() => {
      FakeEventSource.latest().open()
    })
    api.replace({
      ...api.current(),
      unassigned: [...api.current().unassigned, createLaneBowler({ name: 'New Entry' })],
    })

    act(() => {
      FakeEventSource.latest().message()
    })

    await waitFor(() => {
      expect(result.current.events.updated?.text).toBe('Updated: unassigned list')
    })
    expect(result.current.lanes.data?.unassigned.map((bowler) => bowler.name)).toContain(
      'New Entry',
    )
    expect(result.current.events.updated?.pairs).toEqual([])
    expect(result.current.events.updated?.version).toBe(1)
  })

  it('names the pair another desk changed (LAN-19)', async () => {
    const { result, api } = setup()
    await waitFor(() => {
      expect(result.current.lanes.data).toBeDefined()
    })
    const [pat] = api.current().unassigned
    if (!pat) throw new Error('No waiting bowler')
    api.replace({
      ...api.current(),
      unassigned: api.current().unassigned.slice(1),
      pairs: api
        .current()
        .pairs.map((pair) =>
          pair.firstLane === 5 ? { ...pair, bowlers: [{ ...pat, position: '5A' }] } : pair,
        ),
    })

    act(() => {
      FakeEventSource.latest().message()
    })

    await waitFor(() => {
      expect(result.current.events.updated).toMatchObject({
        text: 'Updated: lanes 5-6, unassigned list',
        pairs: [5],
      })
    })
  })

  it('says nothing when the refetch shows what the page already had (our own save)', async () => {
    const { result, client } = setup()
    await waitFor(() => {
      expect(result.current.lanes.data).toBeDefined()
    })
    const fetches = vi.spyOn(client, 'invalidateQueries')

    act(() => {
      FakeEventSource.latest().message()
    })

    await waitFor(() => {
      expect(fetches).toHaveBeenCalledTimes(1)
    })
    await act(() => fetches.mock.results[0]?.value)
    expect(result.current.events.updated).toBeUndefined()
  })

  it('counts each update, so the page can tell two apart', async () => {
    const { result, api } = setup()
    await waitFor(() => {
      expect(result.current.lanes.data).toBeDefined()
    })
    for (const name of ['One', 'Two']) {
      api.replace({
        ...api.current(),
        unassigned: [...api.current().unassigned, createLaneBowler({ name })],
      })
      act(() => {
        FakeEventSource.latest().message()
      })
      await waitFor(() => {
        expect(result.current.lanes.data?.unassigned.map((bowler) => bowler.name)).toContain(name)
      })
    }
    await waitFor(() => {
      expect(result.current.events.updated?.version).toBe(2)
    })
  })

  it('goes back to "Live" after a few seconds (LAN-19)', async () => {
    const { result, api } = setup()
    await waitFor(() => {
      expect(result.current.lanes.data).toBeDefined()
    })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.replace({
      ...api.current(),
      unassigned: [...api.current().unassigned, createLaneBowler({ name: 'Late' })],
    })
    act(() => {
      FakeEventSource.latest().message()
    })
    await waitFor(() => {
      expect(result.current.events.updated).toBeDefined()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATED_MS - 500)
    })
    expect(result.current.events.updated).toBeDefined()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(result.current.events.updated).toBeUndefined()
  })

  it('is reconnecting after a drop, and refetches once when it is back (D-218)', async () => {
    const { result, api } = setup()
    await waitFor(() => {
      expect(result.current.lanes.data).toBeDefined()
    })
    act(() => {
      FakeEventSource.latest().open()
    })
    act(() => {
      FakeEventSource.latest().fail()
    })
    expect(result.current.events.state).toBe('reconnecting')
    api.replace({
      ...api.current(),
      unassigned: [...api.current().unassigned, createLaneBowler({ name: 'Missed' })],
    })

    act(() => {
      FakeEventSource.latest().open()
    })

    expect(result.current.events.state).toBe('live')
    await waitFor(() => {
      expect(result.current.lanes.data?.unassigned.map((bowler) => bowler.name)).toContain('Missed')
    })
  })

  it('does not refetch on the first connection (D-218)', async () => {
    const { result, client } = setup()
    await waitFor(() => {
      expect(result.current.lanes.data).toBeDefined()
    })
    const fetches = vi.spyOn(client, 'invalidateQueries')

    act(() => {
      FakeEventSource.latest().open()
    })

    expect(fetches).not.toHaveBeenCalled()
  })

  it('is off when the browser gives up, as after a lost sign-in (401 or 403)', async () => {
    const { result } = setup()
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1)
    })

    act(() => {
      FakeEventSource.latest().fail(true)
    })

    expect(result.current.events.state).toBe('off')
  })
})
