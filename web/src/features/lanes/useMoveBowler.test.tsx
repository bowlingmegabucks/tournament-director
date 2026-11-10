import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../mocks/server'
import { filled, pat, tournament } from './lanesTestSupport'
import type { LanePage } from './types'
import { laneKeys } from './useLanes'
import { useMoveBowler, type MoveRequest } from './useMoveBowler'

const page = filled()
const key = laneKeys.page('squad', tournament.id, page.session.id)
const putPath = '/v1/tournaments/:id/squads/:sessionId/lanes/:registrationId'

const request: MoveRequest = {
  registrationId: pat.registrationId,
  lane: 5,
  guess: { firstLane: 5, position: '5A' },
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seeded, with no observer: nothing refetches, so the cache shows only what the hook did.
  client.setQueryData(key, page)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(() => useMoveBowler('squad', tournament.id, page.session.id), { wrapper })
  const cached = () => client.getQueryData<LanePage>(key)
  const seatOf = (name: string) =>
    cached()
      ?.pairs.flatMap((pair) => pair.bowlers)
      .find((bowler) => bowler.name === name)?.position
  return { ...view, client, cached, seatOf }
}

/** A PUT that waits for the test, so the page can be read while the save is out. */
function gatedPut(position: string) {
  let answer: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    answer = resolve
  })
  server.use(
    http.put(putPath, async () => {
      await gate
      return HttpResponse.json({ position })
    }),
  )
  return answer
}

describe('useMoveBowler (LAN-16, LAN-20, D-220)', () => {
  it('moves the bowler on the page before the API answers', async () => {
    const answer = gatedPut('5A')
    const { result, seatOf, cached } = setup()

    act(() => {
      result.current.move(request)
    })

    await waitFor(() => {
      expect(seatOf('Pat Nguyen')).toBe('5A')
    })
    expect(cached()?.unassigned.map((bowler) => bowler.name)).not.toContain('Pat Nguyen')
    answer()
  })

  it('stops a refetch that is in flight, so it cannot undo the guess', async () => {
    gatedPut('5A')
    const { result, client } = setup()
    const cancel = vi.spyOn(client, 'cancelQueries')

    act(() => {
      result.current.move(request)
    })

    await waitFor(() => {
      expect(cancel).toHaveBeenCalledWith({ queryKey: key })
    })
  })

  it('shows the seat the API chose when it differs from the guess (D-57)', async () => {
    server.use(http.put(putPath, () => HttpResponse.json({ position: '6C' })))
    const { result, seatOf } = setup()

    act(() => {
      result.current.move(request)
    })

    await waitFor(() => {
      expect(seatOf('Pat Nguyen')).toBe('6C')
    })
  })

  it('marks the page stale after the save, so it refetches (D-220)', async () => {
    server.use(http.put(putPath, () => HttpResponse.json({ position: '5A' })))
    const { result, client } = setup()

    act(() => {
      result.current.move(request)
    })

    await waitFor(() => {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    })
  })

  it('invalidates only the lane page, not other queries', async () => {
    server.use(http.put(putPath, () => HttpResponse.json({ position: '5A' })))
    const { result, client } = setup()
    client.setQueryData(['somethingElse'], 1)

    act(() => {
      result.current.move(request)
    })

    await waitFor(() => {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(['somethingElse'])?.isInvalidated).toBe(false)
  })

  it('puts the page back as it was when the API refuses (Q-28)', async () => {
    server.use(
      http.put(putPath, () => HttpResponse.json({ message: 'Pair is full' }, { status: 409 })),
    )
    const { result, cached, client } = setup()
    const onError = vi.fn()

    act(() => {
      result.current.move(request, { onError })
    })

    await waitFor(() => {
      expect(onError).toHaveBeenCalled()
    })
    expect(cached()).toEqual(page)
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ message: 'Pair is full', status: 409 })
    expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  })

  it('lists the bowler as saving while the request is out, then not', async () => {
    const answer = gatedPut('5A')
    const { result } = setup()
    expect(result.current.savingIds.size).toBe(0)

    act(() => {
      result.current.move(request)
    })

    await waitFor(() => {
      expect([...result.current.savingIds]).toEqual([pat.registrationId])
    })
    answer()
    await waitFor(() => {
      expect(result.current.savingIds.size).toBe(0)
    })
  })

  it('does not touch a page that is not in the cache', async () => {
    server.use(http.put(putPath, () => HttpResponse.json({ position: '5A' })))
    const { result, client, cached } = setup()
    client.removeQueries({ queryKey: key })

    act(() => {
      result.current.move(request)
    })

    await waitFor(() => {
      expect(result.current.savingIds.size).toBe(0)
    })
    expect(cached()).toBeUndefined()
  })
})
