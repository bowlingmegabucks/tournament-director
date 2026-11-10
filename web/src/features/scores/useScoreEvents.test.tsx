import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScoreBowler, createScorePage, createScorePair } from '../../mocks/data'
import { server } from '../../mocks/server'
import { FakeEventSource } from '../../test/fakeEventSource'
import { SCORE_UPDATED_MS, useScoreEvents } from './useScoreEvents'
import { scoreKeys, useScores } from './useScores'

const joe = (scores: (number | null)[]) =>
  createScoreBowler({ registrationId: 'joe', name: 'Joe Fontaine', scores })
const pageWith = (scores: (number | null)[]) =>
  createScorePage({ pairs: [createScorePair(1, [joe(scores)])] })

let current = pageWith([200, null, null])
let requests = 0

beforeEach(() => {
  current = pageWith([200, null, null])
  requests = 0
  server.use(
    http.get('/v1/tournaments/t1/squads/s1/scores', () => {
      requests += 1
      return HttpResponse.json(current)
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function setup(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(
    () => ({
      scores: useScores('squad', 't1', 's1'),
      events: useScoreEvents('squad', 't1', 's1', enabled),
    }),
    { wrapper },
  )
  return { client, ...view }
}

async function ready(enabled = true) {
  const view = setup(enabled)
  await waitFor(() => {
    expect(view.result.current.scores.data).toBeDefined()
  })
  return view
}

/** A keeper elsewhere saves: the page changes, the stream says so, and the refetch lands. */
async function pushChange(scores: (number | null)[]) {
  current = pageWith(scores)
  await act(async () => {
    FakeEventSource.latest().message()
    await vi.waitFor(() => {
      expect(requests).toBeGreaterThan(0)
    })
  })
}

describe('useScoreEvents (SCR-18, SCR-20, D-232, D-237)', () => {
  it('opens the public scores stream of the session', async () => {
    await ready()
    expect(FakeEventSource.latest().url).toBe('/v1/tournaments/t1/squads/s1/scores/events')
  })

  it('opens the sweeper stream for a sweeper', async () => {
    const client = new QueryClient()
    renderHook(() => useScoreEvents('sweeper', 't1', 's9', true), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    })
    expect(FakeEventSource.latest().url).toBe('/v1/tournaments/t1/sweepers/s9/scores/events')
  })

  it('opens no stream and says off when it is not enabled (D-10)', async () => {
    const { result } = await ready(false)
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(result.current.events.state).toBe('off')
    expect(result.current.events.updated).toBeUndefined()
  })

  it('refetches on a message and says who and which game changed', async () => {
    const { result } = await ready()
    const before = requests

    await pushChange([200, 187, null])

    await waitFor(() => {
      expect(result.current.events.updated).toEqual({
        text: 'Updated: Joe Fontaine, game 2',
        ids: ['joe'],
        version: 1,
      })
    })
    expect(requests).toBeGreaterThan(before)
  })

  it('says nothing for a refetch of the scores already shown, our own save coming back', async () => {
    const { result } = await ready()

    await pushChange([200, null, null])

    expect(result.current.events.updated).toBeUndefined()
  })

  it('counts each change', async () => {
    const { result } = await ready()
    await pushChange([200, 187, null])
    await waitFor(() => {
      expect(result.current.events.updated?.version).toBe(1)
    })

    await pushChange([211, 187, null])

    await waitFor(() => {
      expect(result.current.events.updated).toMatchObject({
        text: 'Updated: Joe Fontaine, game 1',
        version: 2,
      })
    })
  })

  it('restarts the clock when a second change arrives before the first line expires', async () => {
    const { result } = await ready()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await pushChange([200, 187, null])
    await vi.waitFor(() => {
      expect(result.current.events.updated?.version).toBe(1)
    })
    act(() => {
      vi.advanceTimersByTime(SCORE_UPDATED_MS - 1000)
    })

    await pushChange([211, 187, null])
    await vi.waitFor(() => {
      expect(result.current.events.updated?.version).toBe(2)
    })
    act(() => {
      vi.advanceTimersByTime(SCORE_UPDATED_MS - 1000)
    })

    expect(result.current.events.updated?.version).toBe(2)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.events.updated).toBeUndefined()
  })

  it('leaves no timer behind when the page goes away', async () => {
    const { result, unmount } = await ready()
    await pushChange([200, 187, null])
    await waitFor(() => {
      expect(result.current.events.updated).toBeDefined()
    })
    const clear = vi.spyOn(globalThis, 'clearTimeout')

    unmount()

    expect(clear).toHaveBeenCalled()
  })

  it('refetches once when the stream comes back after a drop', async () => {
    await ready()
    const stream = FakeEventSource.latest()
    act(() => {
      stream.open()
    })
    const before = requests

    act(() => {
      stream.fail()
      stream.open()
    })

    await waitFor(() => {
      expect(requests).toBe(before + 1)
    })
  })

  it('marks only this session’s scores stale, on a message and on a reconnect', async () => {
    const { client } = await ready()
    const other = ['other', 'query']
    client.setQueryData(other, 'x')
    const stream = FakeEventSource.latest()
    act(() => {
      stream.open()
    })

    act(() => {
      stream.message()
      stream.fail()
      stream.open()
    })

    await waitFor(() => {
      expect(requests).toBeGreaterThan(1)
    })
    expect(client.getQueryState(other)?.isInvalidated).toBe(false)
    expect(client.getQueryState(scoreKeys.page('squad', 't1', 's1'))).toBeDefined()
  })
})
