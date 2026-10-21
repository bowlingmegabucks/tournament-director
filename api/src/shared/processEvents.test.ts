import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCapturedLogger } from '../test/logger.ts'
import { handleProcessEvents } from './processEvents.ts'

function setup(options: { serverClosesAfterMs?: number } = {}) {
  const events = new EventEmitter()
  const { logger, records } = createCapturedLogger()
  const exit = vi.fn<(code: number) => void>()
  const flush = vi.fn(() => Promise.resolve())
  const server = {
    close: vi.fn((callback: () => void) => {
      if (options.serverClosesAfterMs !== undefined) {
        setTimeout(callback, options.serverClosesAfterMs)
      }
    }),
  }
  handleProcessEvents(events, { logger, server, flush, exit, forceExitMs: 1000 })
  return { events, records, exit, flush, server }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe.each(['SIGINT', 'SIGTERM'])('%s', (signal) => {
  it('closes the server, sends telemetry, and exits 0', async () => {
    const { events, records, exit, flush, server } = setup({ serverClosesAfterMs: 10 })

    events.emit(signal)
    expect(server.close).toHaveBeenCalledOnce()
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10)

    expect(flush).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledExactlyOnceWith(0)
    expect(records()).toMatchObject([{ level: 30, msg: 'Shutting down', signal }])
  })

  it('stops only once, however many signals come', () => {
    const { events, server } = setup()

    events.emit(signal)
    events.emit(signal)

    expect(server.close).toHaveBeenCalledOnce()
  })
})

describe('a stuck shutdown', () => {
  it('exits 1 after the time limit', async () => {
    const { events, records, exit } = setup()

    events.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(999)
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(records()).toMatchObject([
      { msg: 'Shutting down' },
      { level: 50, msg: 'Shutdown took too long, exiting', forceExitMs: 1000 },
    ])
  })
})

describe('a crash', () => {
  it('logs an uncaught exception as fatal and exits 1', async () => {
    const { events, records, exit, flush } = setup({ serverClosesAfterMs: 0 })

    events.emit('uncaughtException', new Error('boom'))
    await vi.advanceTimersByTimeAsync(0)

    expect(records()).toMatchObject([
      { level: 60, msg: 'Uncaught exception', err: { message: 'boom' } },
    ])
    expect(flush).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('logs an unhandled rejection as fatal and exits 1', async () => {
    const { events, records, exit } = setup({ serverClosesAfterMs: 0 })

    events.emit('unhandledRejection', new Error('nobody caught this'))
    await vi.advanceTimersByTimeAsync(0)

    expect(records()).toMatchObject([
      { level: 60, msg: 'Unhandled promise rejection', err: { message: 'nobody caught this' } },
    ])
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('still exits if sending telemetry fails', async () => {
    const { events, records, exit, flush } = setup({ serverClosesAfterMs: 0 })
    flush.mockRejectedValue(new Error('network down'))

    events.emit('uncaughtException', new Error('boom'))
    await vi.advanceTimersByTimeAsync(0)

    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(records()).toMatchObject([
      { msg: 'Uncaught exception' },
      { level: 50, msg: 'Could not send telemetry', err: { message: 'network down' } },
    ])
  })
})
