import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { FakeEventSource } from '../../test/fakeEventSource'
import { useEntryEvents } from './useEntryEvents'
import { gamesKeys } from './useGames'

function setup(kind: 'squad' | 'sweeper' = 'squad', enabled = true) {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(() => useEntryEvents(kind, 't1', 's1', enabled), { wrapper })
  return { client, ...view }
}

describe('useEntryEvents (SCR-20, D-232)', () => {
  it('opens the public scores stream of the squad or the sweeper', () => {
    setup('squad')
    expect(FakeEventSource.latest().url).toBe('/v1/tournaments/t1/squads/s1/scores/events')
    setup('sweeper')
    expect(FakeEventSource.latest().url).toBe('/v1/tournaments/t1/sweepers/s1/scores/events')
  })

  it('opens none and says off when it is not enabled (D-10)', () => {
    const { result } = setup('squad', false)
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(result.current).toBe('off')
  })

  it('marks the games of this session stale on a message and on a reconnect, and nothing else', () => {
    const { client } = setup()
    const games = gamesKeys.view('squad', 't1', 's1')
    const other = gamesKeys.view('squad', 't1', 's2')
    client.setQueryData(games, 'x')
    client.setQueryData(other, 'y')
    const stream = FakeEventSource.latest()
    act(() => {
      stream.open()
    })

    act(() => {
      stream.message()
    })
    expect(client.getQueryState(games)?.isInvalidated).toBe(true)
    expect(client.getQueryState(other)?.isInvalidated).toBe(false)

    client.setQueryData(games, 'x')
    act(() => {
      stream.fail()
      stream.open()
    })
    expect(client.getQueryState(games)?.isInvalidated).toBe(true)
    expect(client.getQueryState(other)?.isInvalidated).toBe(false)
  })
})
