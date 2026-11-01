import type { AddressInfo } from 'node:net'
import { trace, type Span } from '@opentelemetry/api'
import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LogLevel } from '../config.ts'
import { createCapturedLogger } from '../test/logger.ts'
import { redactSecrets, requestLogger, requestLogging } from './requestLogging.ts'

function createApp(level: LogLevel = 'info') {
  const { logger, records } = createCapturedLogger(level)
  const app = express()
  app.use(requestLogging(logger))
  app.get('/ok', (_req, res) => {
    res.json({})
  })
  app.get('/health', (_req, res) => {
    res.json({})
  })
  app.get('/bad', (_req, res) => {
    res.status(400).json({})
  })
  app.get('/fail', (_req, res) => {
    res.status(500).json({})
  })
  app.get('/mine', (_req, res) => {
    requestLogger(res, logger).info('inside the handler')
    res.json({})
  })
  return { app, records }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('request id', () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

  it('is new when the caller sends none', async () => {
    const { app } = createApp()

    const response = await request(app).get('/ok')

    expect(response.headers['x-request-id']).toMatch(uuid)
  })

  it('is different for each request', async () => {
    const { app } = createApp()

    const first = await request(app).get('/ok')
    const second = await request(app).get('/ok')

    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id'])
  })

  it('reuses a plain id from the caller', async () => {
    const { app, records } = createApp()

    const response = await request(app).get('/ok').set('x-request-id', 'abc-123_X.y')

    expect(response.headers['x-request-id']).toBe('abc-123_X.y')
    expect(records()).toMatchObject([{ requestId: 'abc-123_X.y' }])
  })

  it.each(['has space', 'semi;colon', 'a'.repeat(65), ''])('replaces the id %j', async (id) => {
    const { app } = createApp()

    const response = await request(app).get('/ok').set('x-request-id', id)

    expect(response.headers['x-request-id']).toMatch(uuid)
  })

  it('goes on the active trace span', async () => {
    const setAttribute = vi.fn()
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({ setAttribute } as unknown as Span)
    const { app } = createApp()

    const response = await request(app).get('/ok')

    expect(setAttribute).toHaveBeenCalledWith('request.id', response.headers['x-request-id'])
  })

  it('reaches the logger a handler gets', async () => {
    const { app, records } = createApp()

    const response = await request(app).get('/mine')

    const handlerLine = records().find((record) => record['msg'] === 'inside the handler')
    expect(handlerLine).toMatchObject({ requestId: response.headers['x-request-id'] })
  })
})

describe('request line', () => {
  it('logs the method, path, status, duration, and id', async () => {
    const { app, records } = createApp()

    const response = await request(app).get('/ok')

    expect(records()).toEqual([
      expect.objectContaining({
        level: 30,
        msg: 'Request completed',
        method: 'GET',
        path: '/ok',
        status: 200,
        aborted: false,
        requestId: response.headers['x-request-id'],
      }),
    ])
  })

  it('leaves the query string out', async () => {
    const { app, records } = createApp()

    await request(app).get('/ok?email=a@b.example')

    expect(records()[0]?.['path']).toBe('/ok')
  })

  it('replaces a reset-link token in the path with [redacted]', async () => {
    const { app, records } = createApp()

    await request(app).get('/v1/auth/reset-password/abc123secrettoken?callbackURL=/x')

    expect(records()[0]?.['path']).toBe('/v1/auth/reset-password/[redacted]')
    expect(JSON.stringify(records())).not.toContain('abc123secrettoken')
  })

  it('warns on a 4xx', async () => {
    const { app, records } = createApp()

    await request(app).get('/missing')

    expect(records()).toMatchObject([{ level: 40, status: 404 }])
  })

  it('warns on exactly 400', async () => {
    const { app, records } = createApp()

    await request(app).get('/bad')

    expect(records()).toMatchObject([{ level: 40, status: 400 }])
  })

  it('times the request in milliseconds', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValue(1250.4)
    const { app, records } = createApp()

    await request(app).get('/ok')

    expect(records()[0]?.['durationMs']).toBe(250)
  })

  it('errors on a 5xx', async () => {
    const { app, records } = createApp()

    await request(app).get('/fail')

    expect(records()).toMatchObject([{ level: 50, status: 500 }])
  })

  it('hides health probes at the info level', async () => {
    const { app, records } = createApp('info')

    await request(app).get('/health')

    expect(records()).toEqual([])
  })

  it('shows health probes at the debug level', async () => {
    const { app, records } = createApp('debug')

    await request(app).get('/health')

    expect(records()).toMatchObject([{ level: 20, path: '/health' }])
  })

  it('marks a request the caller dropped', async () => {
    const { logger, records } = createCapturedLogger()
    const app = express()
    app.use(requestLogging(logger))
    app.get('/slow', () => {
      // Never answers.
    })
    const server = app.listen(0)
    const { port } = server.address() as AddressInfo
    const controller = new AbortController()

    const call = fetch(`http://127.0.0.1:${port}/slow`, { signal: controller.signal }).catch(
      () => undefined,
    )
    await vi.waitFor(() => expect(server.listening).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    controller.abort()
    await call
    await vi.waitFor(() => expect(records()).toHaveLength(1))
    server.close()

    expect(records()).toMatchObject([{ path: '/slow', aborted: true }])
  })
})

describe('requestLogger', () => {
  it('falls back outside a request', () => {
    const { logger } = createCapturedLogger()

    expect(requestLogger({ locals: {} } as express.Response, logger)).toBe(logger)
  })
})

describe('redactSecrets', () => {
  it.each([
    ['/v1/auth/reset-password/abc', '/v1/auth/reset-password/[redacted]'],
    ['/v1/auth/reset-password/a.b-c_d%20e', '/v1/auth/reset-password/[redacted]'],
    ['/v1/auth/reset-password/abc/extra', '/v1/auth/reset-password/[redacted]/extra'],
    [
      '/v1/auth/reset-password/abc?callbackURL=/x',
      '/v1/auth/reset-password/[redacted]?callbackURL=/x',
    ],
  ])('redacts %s', (path, expected) => {
    expect(redactSecrets(path)).toBe(expected)
  })

  it.each([
    '/v1/auth/reset-password',
    '/v1/auth/reset-password/',
    '/v1/auth/sign-in/email',
    '/v1/tournaments/abc',
    '/health',
    '/other/v1/auth/reset-password/abc',
    '',
  ])('leaves %j alone', (path) => {
    expect(redactSecrets(path)).toBe(path)
  })
})
