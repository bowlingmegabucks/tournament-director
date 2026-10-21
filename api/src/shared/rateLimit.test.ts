import {
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createConfig } from '../test/factories.ts'
import { createTestApp } from '../test/testApp.ts'
import { clientKey } from './rateLimit.ts'

function limitedApp(max: number, trustProxy = 0) {
  return createTestApp({
    config: createConfig({ rateLimit: { max, windowSeconds: 60 }, trustProxy }),
  })
}

describe('rate limit', () => {
  it('allows requests up to the limit', async () => {
    const app = limitedApp(2)

    const first = await request(app).get('/tournaments')
    const second = await request(app).get('/tournaments')

    expect([first.status, second.status]).toEqual([200, 200])
  })

  it('answers 429 over the limit, in the standard error shape', async () => {
    const app = limitedApp(2)
    await request(app).get('/tournaments')
    await request(app).get('/tournaments')

    const response = await request(app).get('/tournaments')

    expect(response.status).toBe(429)
    expect(response.body).toEqual({ message: 'Too many requests. Try again later.' })
  })

  it('tells the caller when to retry', async () => {
    const app = limitedApp(1)
    await request(app).get('/tournaments')

    const response = await request(app).get('/tournaments')

    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)
    expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(60)
  })

  it('reports the limit on every response', async () => {
    const response = await request(limitedApp(5)).get('/tournaments')

    expect(response.headers['ratelimit-policy']).toBe('5;w=60')
    expect(response.headers['ratelimit']).toContain('remaining=4')
    expect(response.headers['x-ratelimit-limit']).toBeUndefined()
  })

  it('never counts or blocks /health', async () => {
    const app = limitedApp(1)

    const statuses = []
    for (let i = 0; i < 3; i++) statuses.push((await request(app).get('/health')).status)

    expect(statuses).toEqual([200, 200, 200])
    expect((await request(app).get('/tournaments')).status).toBe(200)
  })

  it('keeps the CORS headers on a 429', async () => {
    const origin = 'https://app.example'
    const app = createTestApp({
      config: createConfig({ corsOrigins: [origin], rateLimit: { max: 1, windowSeconds: 60 } }),
    })
    await request(app).get('/tournaments').set('Origin', origin)

    const response = await request(app).get('/tournaments').set('Origin', origin)

    expect(response.status).toBe(429)
    expect(response.headers['access-control-allow-origin']).toBe(origin)
  })

  it('counts each client address on its own behind a proxy', async () => {
    const app = limitedApp(1, 1)
    await request(app).get('/tournaments').set('X-Forwarded-For', '203.0.113.1')

    const sameClient = await request(app).get('/tournaments').set('X-Forwarded-For', '203.0.113.1')
    const otherClient = await request(app).get('/tournaments').set('X-Forwarded-For', '203.0.113.2')

    expect([sameClient.status, otherClient.status]).toEqual([429, 200])
  })

  it('counts one client once when the proxy adds a changing port', async () => {
    const app = limitedApp(1, 1)
    await request(app).get('/tournaments').set('X-Forwarded-For', '203.0.113.1:50001')

    const response = await request(app)
      .get('/tournaments')
      .set('X-Forwarded-For', '203.0.113.1:50002')

    expect(response.status).toBe(429)
  })

  it('ignores X-Forwarded-For when no proxy is trusted', async () => {
    const app = limitedApp(1, 0)
    await request(app).get('/tournaments').set('X-Forwarded-For', '203.0.113.1')

    const response = await request(app).get('/tournaments').set('X-Forwarded-For', '203.0.113.2')

    expect(response.status).toBe(429)
  })

  it('does not trust a forged left-hand address when one proxy is trusted', async () => {
    const app = limitedApp(1, 1)
    await request(app).get('/tournaments').set('X-Forwarded-For', '198.51.100.7, 203.0.113.1')

    const response = await request(app)
      .get('/tournaments')
      .set('X-Forwarded-For', '198.51.100.8, 203.0.113.1')

    expect(response.status).toBe(429)
  })
})

describe('rejection metric', () => {
  async function setup(max: number) {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
    const provider = new MeterProvider({
      readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 })],
    })
    const app = createTestApp({
      config: createConfig({ rateLimit: { max, windowSeconds: 60 } }),
      meter: provider.getMeter('test'),
    })
    async function find() {
      await provider.forceFlush()
      return exporter
        .getMetrics()
        .flatMap((data) => data.scopeMetrics)
        .flatMap((scope) => scope.metrics)
        .findLast((m) => m.descriptor.name === 'tournament_director.rate_limit.rejections')
    }
    // Sum of the counter, or 0 when it never recorded anything.
    async function rejections(): Promise<number> {
      const metric = await find()
      return metric?.dataPoints.reduce((sum, point) => sum + Number(point.value), 0) ?? 0
    }
    return { app, rejections, find }
  }

  it('counts each request turned away', async () => {
    const { app, rejections } = await setup(1)

    await request(app).get('/tournaments')
    await request(app).get('/tournaments')
    await request(app).get('/tournaments')

    expect(await rejections()).toBe(2)
  })

  it('describes the metric', async () => {
    const { app, find } = await setup(1)
    await request(app).get('/tournaments')
    await request(app).get('/tournaments')

    const metric = await find()

    expect(metric?.descriptor).toMatchObject({
      unit: '{request}',
      description: expect.stringContaining('429') as string,
    })
  })

  it('does not count requests that got through', async () => {
    const { app, rejections } = await setup(5)

    await request(app).get('/tournaments')

    expect(await rejections()).toBe(0)
  })
})

describe('rate limit setup', () => {
  it('raises no key generator warning on the first request', async () => {
    // express-rate-limit reports a setup problem with console.error, once, on the first request.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await request(limitedApp(2)).get('/tournaments')

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('clientKey', () => {
  it.each([
    ['203.0.113.9', '203.0.113.9'],
    ['203.0.113.9:51234', '203.0.113.9'],
    ['[2001:db8::1]:51234', '2001:db8::/56'],
  ])('turns %s into %s', (ip, key) => {
    expect(clientKey(ip)).toBe(key)
  })

  it.each(['foo203.0.113.9:80', '203.0.113.9:80x', 'x[2001:db8::1]:80', '[2001:db8::1]:80x'])(
    'leaves %s alone, because it is not an address with a port',
    (ip) => {
      expect(clientKey(ip)).toBe(ip)
    },
  )

  it('puts IPv6 addresses in the same /56 network in one bucket', () => {
    expect(clientKey('2001:db8:0:1::1')).toBe(clientKey('2001:db8:0:1::ffff'))
    expect(clientKey('2001:db8:0:100::1')).not.toBe(clientKey('2001:db8:0:1::1'))
  })

  it('keeps a plain IPv6 address whole', () => {
    expect(clientKey('2001:db8::1')).toBe('2001:db8::/56')
  })
})
