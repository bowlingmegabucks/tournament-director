import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../mocks/server'
import { createLanePair } from '../../mocks/data'
import { dana, filled, joe, tournament } from './lanesTestSupport'
import type { LanePage } from './types'
import { laneKeys } from './useLanes'
import { usePairPlay } from './usePairPlay'

const page = filled()
const key = laneKeys.page('squad', tournament.id, page.session.id)
const putPath = '/v1/tournaments/:id/squads/:sessionId/lanes/pairs/:lane'
const [first] = page.pairs
const empty = createLanePair(5)

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seeded, with no observer: nothing refetches, so the cache shows only what the hook did.
  client.setQueryData(key, page)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const onError = vi.fn()
  const view = renderHook(() => usePairPlay('squad', tournament.id, page.session.id, onError), {
    wrapper,
  })
  const pairAt = (lane: number) =>
    client.getQueryData<LanePage>(key)?.pairs.find((pair) => pair.firstLane === lane)
  const unassigned = () => client.getQueryData<LanePage>(key)?.unassigned.length
  return { ...view, client, onError, pairAt, unassigned }
}

/** A PUT that waits for the test, so the page can be read while the save is out. */
function gatedPut(status = 200, body: Record<string, unknown> = {}) {
  let answer: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    answer = resolve
  })
  server.use(
    http.put(putPath, async () => {
      await gate
      return HttpResponse.json(body, { status })
    }),
  )
  return answer
}

const refusal = { message: 'No.' }
const warnings = { message: 'x', warnings: [{ field: 'inPlay', message: 'x' }] }

describe('usePairPlay (OOP-03 to OOP-05)', () => {
  it('asks before a pair with bowlers, and cancel drops the question', () => {
    const { result, pairAt } = setup()

    act(() => {
      result.current.takeOut(first ?? empty)
    })
    expect(result.current.asking).toBe(1)
    expect(pairAt(1)?.outOfPlay).toBe(false)

    act(() => {
      result.current.cancel()
    })
    expect(result.current.asking).toBeUndefined()
  })

  it('shows the pair out and its bowlers unassigned before the API answers', async () => {
    const answer = gatedPut()
    const { result, pairAt, unassigned } = setup()

    act(() => {
      result.current.confirm(first ?? empty)
    })

    await waitFor(() => {
      expect(pairAt(1)?.outOfPlay).toBe(true)
    })
    expect(pairAt(1)?.bowlers).toEqual([])
    expect(pairAt(3)?.outOfPlay).toBe(false)
    expect(pairAt(3)?.bowlers).toHaveLength(5)
    expect(unassigned()).toBe(4)
    expect(result.current.saving.get(1)).toBe(false)
    answer()
    await waitFor(() => {
      expect(result.current.saving.size).toBe(0)
    })
  })

  it.each([
    ['a refusal', 409, refusal],
    ['a question', 409, warnings],
  ])('puts the page back after %s', async (_name, status, body) => {
    const answer = gatedPut(status, body)
    const { result, pairAt, unassigned } = setup()
    act(() => {
      result.current.confirm(first ?? empty)
    })
    await waitFor(() => {
      expect(pairAt(1)?.outOfPlay).toBe(true)
    })

    answer()

    await waitFor(() => {
      expect(pairAt(1)?.outOfPlay).toBe(false)
    })
    expect(pairAt(1)?.bowlers.map((bowler) => bowler.name)).toEqual([joe.name, dana.name])
    expect(unassigned()).toBe(2)
  })

  it('passes a refusal on, and opens the question again for a question', async () => {
    server.use(http.put(putPath, () => HttpResponse.json(warnings, { status: 409 })))
    const asked = setup()
    act(() => {
      asked.result.current.confirm(first ?? empty)
    })
    await waitFor(() => {
      expect(asked.result.current.asking).toBe(1)
    })
    expect(asked.onError).not.toHaveBeenCalled()

    server.use(http.put(putPath, () => HttpResponse.json(refusal, { status: 409 })))
    const refused = setup()
    act(() => {
      refused.result.current.takeOut(empty)
    })
    await waitFor(() => {
      expect(refused.onError).toHaveBeenCalledWith('No.')
    })
  })

  it('leaves another change on screen when one fails while it is still saving', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.put(putPath, async ({ params }) => {
        if (params['lane'] === '5') return HttpResponse.json(refusal, { status: 409 })
        await gate
        return HttpResponse.json({})
      }),
    )
    const { result, client, onError, pairAt } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    act(() => {
      result.current.takeOut(createLanePair(7))
    })
    await waitFor(() => {
      expect(pairAt(7)?.outOfPlay).toBe(true)
    })
    act(() => {
      result.current.takeOut(empty)
    })
    await waitFor(() => {
      expect(onError).toHaveBeenCalled()
    })

    expect(pairAt(7)?.outOfPlay).toBe(true)
    expect(invalidate).not.toHaveBeenCalled()

    release()
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: key })
    })
  })
})
