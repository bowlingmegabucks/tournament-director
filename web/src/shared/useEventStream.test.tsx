import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeEventSource } from '../test/fakeEventSource'
import { useEventStream } from './useEventStream'

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
    const { onChange } = setup()
    act(() => {
      FakeEventSource.latest().message('{"kind":"scores","version":4}')
      FakeEventSource.latest().message('{"kind":"lanes","version":5}')
    })
    expect(onChange.mock.calls).toEqual([['scores'], ['lanes']])
  })

  it.each(['not json', '{"version":1}', '{"kind":7}', 'null', '"text"'])(
    'treats %s as a change of unknown kind, so the page still asks again',
    (data) => {
      const { onChange } = setup()
      act(() => {
        FakeEventSource.latest().message(data)
      })
      expect(onChange).toHaveBeenCalledWith('unknown')
    },
  )

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
