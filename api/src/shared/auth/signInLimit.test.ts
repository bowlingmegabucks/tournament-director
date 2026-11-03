import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { HttpError } from '../errors.ts'
import {
  createForgotLimiter,
  createResetLimiter,
  createSignInLimiter,
  forgotAttempts,
  signInAttempts,
} from './signInLimit.ts'

/** A route that answers with the status in `?status=`, behind the limiter. */
function setup(createLimiter: (meter: ReturnType<MeterProvider['getMeter']>) => RequestHandler) {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  const provider = new MeterProvider({
    readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 })],
  })
  const app = express()
  app.post('/try', createLimiter(provider.getMeter('test')), (req, res) => {
    res.status(Number(req.query['status'] ?? 200)).json({ ok: true })
  })
  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error instanceof HttpError ? error.status : 500).json({ message: error.message })
  }
  app.use(onError)

  const attempt = (status: number) => request(app).post(`/try?status=${status}`)
  async function count(reason: string): Promise<number> {
    await provider.forceFlush()
    const metric = exporter
      .getMetrics()
      .flatMap((data) => data.scopeMetrics)
      .flatMap((scope) => scope.metrics)
      .findLast((m) => m.descriptor.name === 'tournament_director.auth.failures')
    return (
      metric?.dataPoints
        .filter((point) => point.attributes['reason'] === reason)
        .reduce((sum, point) => sum + Number(point.value), 0) ?? 0
    )
  }
  return { attempt, count }
}

describe('createSignInLimiter', () => {
  it('lets refused attempts through up to the limit, then answers 429', async () => {
    const { attempt } = setup(createSignInLimiter)
    for (let i = 0; i < signInAttempts; i++) expect((await attempt(401)).status).toBe(401)

    const response = await attempt(401)

    expect(response.status).toBe(429)
    expect(response.body).toEqual({ message: 'Too many sign-in attempts. Try again later.' })
  })

  it('does not count successful sign-ins', async () => {
    const { attempt } = setup(createSignInLimiter)
    for (let i = 0; i < signInAttempts + 2; i++) await attempt(200)

    expect((await attempt(200)).status).toBe(200)
  })

  it('does not count a server error against the caller', async () => {
    const { attempt } = setup(createSignInLimiter)
    for (let i = 0; i < signInAttempts + 2; i++) await attempt(500)

    expect((await attempt(401)).status).toBe(401)
  })

  it('reports the retry window in a header', async () => {
    const { attempt } = setup(createSignInLimiter)
    await attempt(401)

    const response = await attempt(401)

    expect(response.headers['ratelimit-policy']).toBeDefined()
  })

  it('counts a throttled request as sign_in_throttled', async () => {
    const { attempt, count } = setup(createSignInLimiter)
    for (let i = 0; i < signInAttempts; i++) await attempt(401)
    await attempt(401)
    await attempt(401)

    expect(await count('sign_in_throttled')).toBe(2)
  })
})

describe('createResetLimiter', () => {
  it('answers 429 with its own message and reason', async () => {
    const { attempt, count } = setup(createResetLimiter)
    for (let i = 0; i < signInAttempts; i++) await attempt(400)

    const response = await attempt(400)

    expect(response.status).toBe(429)
    expect(response.body).toEqual({
      message: 'Too many attempts to set a password. Try again later.',
    })
    expect(await count('reset_throttled')).toBe(1)
  })
})

describe('createForgotLimiter', () => {
  it('counts every request, successful or not', async () => {
    const { attempt, count } = setup(createForgotLimiter)
    for (let i = 0; i < forgotAttempts; i++) expect((await attempt(200)).status).toBe(200)

    const response = await attempt(200)

    expect(response.status).toBe(429)
    expect(response.body).toEqual({ message: 'Too many password reset requests. Try again later.' })
    expect(await count('forgot_throttled')).toBe(1)
  })
})
