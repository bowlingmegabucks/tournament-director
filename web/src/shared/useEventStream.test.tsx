import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeEventSource } from '../test/fakeEventSource'
import { FALLBACK_POLL_MS, MESSAGE_WINDOW_MS, useEventStream } from './useEventStream'

function setup(enabled = true) {
  const onChange = vi.fn()
  const onReconnect = vi.fn()
  const view = renderHook(({ path, on }) => useEventStream(path, on, { onChange, onReconnect }), {
    initialProps: { path: '/v1/x/events', on: enabled },
  })
  return { ...view, onChange, onReconnect }
}

afterEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource)
})

describe('useEventStream (D-217, D-218, D-232)', () => {
  it('opens the path with the cookie and is live once it connects', () => {
    const { result } = setup()
    const stream = FakeEventSource.latest()
    expect(stream.url).toBe('/v1/x/events')
    expect(stream.withCredentials).toBe(true)
    expect(result.current).toBe('reconnecting')

    act(() => {
      stream.open()
    })

    expect(result.current).toBe('live')
  })

  it('tells the page the kind of each change', () => {
    vi.useFakeTimers()
    const { onChange } = setup()
    act(() => {
      FakeEventSource.latest().message('{"kind":"scores","version":4}')
    })
    act(() => {
      vi.advanceTimersByTime(MESSAGE_WINDOW_MS)
      FakeEventSource.latest().message('{"kind":"lanes","version":5}')
    })
    expect(onChange.mock.calls).toEqual([
      ['scores', undefined],
      ['lanes', undefined],
    ])
    vi.useRealTimers()
  })

  it('joins messages inside one window into a single call, keeping a kind other than scores', () => {
    vi.useFakeTimers()
    const { onChange } = setup()
    act(() => {
      FakeEventSource.latest().message('{"kind":"scores","version":1}')
      FakeEventSource.latest().message('{"kind":"scores","version":2}')
      FakeEventSource.latest().message('{"kind":"lanes","version":3}')
      FakeEventSource.latest().message('{"kind":"scores","version":4}')
    })
    expect(onChange.mock.calls).toEqual([['scores', undefined]])

    act(() => {
      vi.advanceTimersByTime(MESSAGE_WINDOW_MS)
    })

    expect(onChange.mock.calls).toEqual([
      ['scores', undefined],
      ['lanes', undefined],
    ])
    vi.useRealTimers()
  })

  it('asks again on a timer while the stream is not live, and stops once it is', () => {
    vi.useFakeTimers()
    const { onReconnect } = setup()

    act(() => {
      vi.advanceTimersByTime(FALLBACK_POLL_MS)
    })
    expect(onReconnect).toHaveBeenCalledTimes(1)

    act(() => {
      FakeEventSource.latest().open()
    })
    act(() => {
      vi.advanceTimersByTime(FALLBACK_POLL_MS * 3)
    })
    expect(onReconnect).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it.each(['not json', '{"version":1}', '{"kind":7}', 'null', '"text"'])(
    'treats %s as a change of unknown kind, so the page still asks again',
    (data) => {
      const { onChange } = setup()
      act(() => {
        FakeEventSource.latest().message(data)
      })
      expect(onChange).toHaveBeenCalledWith('unknown', undefined)
    },
  )

  it('treats a message with no text as a change of unknown kind', () => {
    const { onChange } = setup()
    act(() => {
      FakeEventSource.latest().message(5 as unknown as string)
    })
    expect(onChange).toHaveBeenCalledWith('unknown', undefined)
  })

  it('asks again once when the stream comes back after a drop, and not on the first connect', () => {
    const { onReconnect } = setup()
    const stream = FakeEventSource.latest()

    act(() => {
      stream.open()
    })
    expect(onReconnect).not.toHaveBeenCalled()
    act(() => {
      stream.fail()
      stream.open()
    })

    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('is reconnecting while the browser retries, and off once it gives up', () => {
    const { result } = setup()
    act(() => {
      FakeEventSource.latest().fail()
    })
    expect(result.current).toBe('reconnecting')
    act(() => {
      FakeEventSource.latest().fail(true)
    })
    expect(result.current).toBe('off')
  })

  it('opens nothing while disabled, and closes when it turns disabled or the page leaves', () => {
    const disabled = setup(false)
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(disabled.result.current).toBe('off')
    disabled.unmount()

    const { rerender, unmount } = setup()
    const first = FakeEventSource.latest()
    rerender({ path: '/v1/x/events', on: false })
    expect(first.readyState).toBe(FakeEventSource.CLOSED)
    rerender({ path: '/v1/x/events', on: true })
    const second = FakeEventSource.latest()
    unmount()
    expect(second.readyState).toBe(FakeEventSource.CLOSED)
  })

  it('opens a new stream when the path changes, and closes the old one', () => {
    const { rerender } = setup()
    const first = FakeEventSource.latest()
    rerender({ path: '/v1/y/events', on: true })
    expect(first.readyState).toBe(FakeEventSource.CLOSED)
    expect(FakeEventSource.latest().url).toBe('/v1/y/events')
  })

  it('is off, and does not throw, in a browser with no EventSource', () => {
    vi.stubGlobal('EventSource', undefined)
    const { result } = setup()
    expect(result.current).toBe('off')
  })

  it('uses the latest handlers without reopening the stream', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ handler }) =>
        useEventStream('/v1/x/events', true, { onChange: handler, onReconnect: vi.fn() }),
      { initialProps: { handler: first } },
    )
    rerender({ handler: second })

    act(() => {
      FakeEventSource.latest().message()
    })

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })
})

describe('useEventStream detail and joining (RES-49, D-243)', () => {
  const detail = { sessionId: 's1', sessionKind: 'squad', divisionId: 'd1', game: 3 }
  const message = (kind: string) => JSON.stringify({ kind, detail, version: 1 })

  function mount(options?: { join?: boolean }) {
    const onChange = vi.fn()
    renderHook(() =>
      useEventStream(
        '/v1/tournaments/t1/live-results/events',
        true,
        { onChange, onReconnect: vi.fn() },
        options,
      ),
    )
    act(() => {
      FakeEventSource.latest().open()
    })
    return onChange
  }

  it('passes the detail of a message on', () => {
    const onChange = mount()

    act(() => {
      FakeEventSource.latest().message(message('game-full'))
    })

    expect(onChange).toHaveBeenCalledWith('game-full', detail)
  })

  it('passes undefined for a message with no detail', () => {
    const onChange = mount()

    act(() => {
      FakeEventSource.latest().message('{"kind":"scores","version":1}')
    })

    expect(onChange).toHaveBeenCalledWith('scores', undefined)
  })

  it('delivers every message of a burst when joining is off', () => {
    const onChange = mount({ join: false })

    act(() => {
      FakeEventSource.latest().message(message('game-full'))
      FakeEventSource.latest().message(message('reopened'))
      FakeEventSource.latest().message(message('complete'))
    })

    expect(onChange.mock.calls.map(([kind]) => kind)).toEqual(['game-full', 'reopened', 'complete'])
  })

  it('joins a burst by default and keeps the detail of the message it keeps', () => {
    const onChange = mount()
    vi.useFakeTimers()

    act(() => {
      FakeEventSource.latest().message(message('game-full'))
      FakeEventSource.latest().message('{"kind":"scores","version":2}')
      FakeEventSource.latest().message(message('reopened'))
    })
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    vi.useRealTimers()

    expect(onChange.mock.calls.map(([kind]) => kind)).toEqual(['game-full', 'reopened'])
  })
})
