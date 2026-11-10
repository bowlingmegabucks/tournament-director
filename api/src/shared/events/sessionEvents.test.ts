import { metrics } from '@opentelemetry/api'
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import { describe, expect, it, vi } from 'vitest'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSessionEvents, type ChangeEvent, type Subscriber } from './sessionEvents.ts'

const noMeter = metrics.getMeter('test')

function watcher() {
  const received: ChangeEvent[] = []
  const subscriber: Subscriber = {
    send: (event) => received.push(event),
    end: vi.fn(),
  }
  return { received, subscriber }
}

describe('createSessionEvents', () => {
  it('tells everyone watching the session, and no one else (LAN-21, D-217)', () => {
    const events = createSessionEvents(createCapturedLogger().logger, noMeter)
    const a = watcher()
    const b = watcher()
    const other = watcher()
    events.subscribe('s1', a.subscriber)
    events.subscribe('s1', b.subscriber)
    events.subscribe('s2', other.subscriber)

    events.publish('s1', 'lanes')

    expect(a.received).toEqual([{ kind: 'lanes', version: 1 }])
    expect(b.received).toEqual([{ kind: 'lanes', version: 1 }])
    expect(other.received).toEqual([])
  })

  it('numbers each message so two can be told apart (D-218)', () => {
    const events = createSessionEvents(createCapturedLogger().logger, noMeter)
    const a = watcher()
    events.subscribe('s1', a.subscriber)
    events.publish('s1', 'lanes')
    events.publish('s1', 'entries')
    expect(a.received).toEqual([
      { kind: 'lanes', version: 1 },
      { kind: 'entries', version: 2 },
    ])
  })

  it('does nothing when no one watches (LAN-22)', () => {
    const events = createSessionEvents(createCapturedLogger().logger, noMeter)
    expect(() => {
      events.publish('nobody', 'entries')
    }).not.toThrow()
    expect(events.count()).toBe(0)
  })

  it('stops sending to a screen that stopped watching, and counts it (D-217)', () => {
    const events = createSessionEvents(createCapturedLogger().logger, noMeter)
    const a = watcher()
    const stop = events.subscribe('s1', a.subscriber)
    expect(events.count()).toBe(1)

    stop?.()
    stop?.()
    events.publish('s1', 'lanes')

    expect(a.received).toEqual([])
    expect(events.count()).toBe(0)
  })

  it('refuses a stream past the limit and keeps the others (D-217)', () => {
    const events = createSessionEvents(createCapturedLogger().logger, noMeter, 2)
    expect(events.subscribe('s1', watcher().subscriber)).toBeDefined()
    expect(events.subscribe('s1', watcher().subscriber)).toBeDefined()
    expect(events.subscribe('s2', watcher().subscriber)).toBeUndefined()
    expect(events.count()).toBe(2)
  })

  it('frees a place when a stream stops (D-217)', () => {
    const events = createSessionEvents(createCapturedLogger().logger, noMeter, 1)
    const stop = events.subscribe('s1', watcher().subscriber)
    stop?.()
    expect(events.subscribe('s1', watcher().subscriber)).toBeDefined()
  })

  it('keeps sending to the rest when one send fails, and logs it without a name (LAN-22)', () => {
    const { logger, records } = createCapturedLogger('debug')
    const events = createSessionEvents(logger, noMeter)
    const broken: Subscriber = {
      send: () => {
        throw new Error('socket closed')
      },
      end: vi.fn(),
    }
    const good = watcher()
    events.subscribe('s1', broken)
    events.subscribe('s1', good.subscriber)

    expect(() => {
      events.publish('s1', 'lanes')
    }).not.toThrow()

    expect(good.received).toHaveLength(1)
    const warning = records().find((line) => line['msg'] === 'Could not send a change message')
    expect(warning).toMatchObject({ level: 40, sessionId: 's1' })
  })

  it('ends every stream on closeAll and forgets them (D-217)', () => {
    const events = createSessionEvents(createCapturedLogger().logger, noMeter)
    const a = watcher()
    const b = watcher()
    events.subscribe('s1', a.subscriber)
    events.subscribe('s2', b.subscriber)

    events.closeAll()

    expect(a.subscriber.end).toHaveBeenCalledTimes(1)
    expect(b.subscriber.end).toHaveBeenCalledTimes(1)
    expect(events.count()).toBe(0)
    events.publish('s1', 'lanes')
    expect(a.received).toEqual([])
  })

  it('still ends the others when one end fails (D-217)', () => {
    const { logger, records } = createCapturedLogger()
    const events = createSessionEvents(logger, noMeter)
    const stuck: Subscriber = {
      send: vi.fn(),
      end: () => {
        throw new Error('already closed')
      },
    }
    const fine = watcher()
    events.subscribe('s1', stuck)
    events.subscribe('s1', fine.subscriber)

    events.closeAll()

    expect(fine.subscriber.end).toHaveBeenCalled()
    expect(records().find((line) => line['msg'] === 'Could not end an event stream')).toMatchObject(
      { level: 40, sessionId: 's1' },
    )
  })

  it('logs a publish to no one with zero watchers (api-observability)', () => {
    const { logger, records } = createCapturedLogger('debug')
    createSessionEvents(logger, noMeter).publish('s9', 'entries')
    expect(records()[0]).toMatchObject({ msg: 'Change published', kind: 'entries', watchers: 0 })
  })

  it('logs opens, closes, and publishes at debug with ids and counts only (api-observability)', () => {
    const { logger, records } = createCapturedLogger('debug')
    const events = createSessionEvents(logger, noMeter)
    const stop = events.subscribe('s1', watcher().subscriber)
    events.publish('s1', 'lanes')
    stop?.()

    expect(records().map((line) => [line['level'], line['msg'], line['sessionId']])).toEqual([
      [20, 'Event stream opened', 's1'],
      [20, 'Change published', 's1'],
      [20, 'Event stream closed', 's1'],
    ])
    expect(records()[0]).toMatchObject({ streams: 1 })
    expect(records()[1]).toMatchObject({ kind: 'lanes', watchers: 1 })
    expect(records()[2]).toMatchObject({ streams: 0 })
  })

  it('counts open streams and published messages as metrics (D-217)', async () => {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
    const provider = new MeterProvider({
      readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 })],
    })
    const events = createSessionEvents(createCapturedLogger().logger, provider.getMeter('test'))
    const stop = events.subscribe('s1', watcher().subscriber)
    events.subscribe('s1', watcher().subscriber)
    events.publish('s1', 'lanes')
    events.publish('s1', 'lanes')
    events.publish('s1', 'entries')
    stop?.()

    await provider.forceFlush()
    const all = exporter
      .getMetrics()
      .flatMap((data) => data.scopeMetrics)
      .flatMap((scope) => scope.metrics)
    const open = all.findLast((m) => m.descriptor.name === 'tournament_director.events.connections')
    const sent = all.findLast((m) => m.descriptor.name === 'tournament_director.events.published')

    expect(open?.dataPoints.map((point) => point.value)).toEqual([1])
    expect(
      Object.fromEntries(
        (sent?.dataPoints ?? []).map((point) => [String(point.attributes['kind']), point.value]),
      ),
    ).toEqual({ lanes: 2, entries: 1 })
  })
})
