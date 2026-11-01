import { metrics, type Meter } from '@opentelemetry/api'
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import express, { Router } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createCapturedLogger } from '../test/logger.ts'
import { apiKeyHeader, identifyCaller } from './auth/caller.ts'
import { createErrorHandler } from './middleware.ts'
import { mountRoutes, type Access, type RouteGroup } from './mountRoutes.ts'

const apiKey = 'the-right-key-0123456789'
const noMeter = metrics.getMeter('test')

function pingRouter(): Router {
  const router = Router()
  router.get('/', (_req, res) => {
    res.json({ ok: true })
  })
  return router
}

/** A tiny app with caller identification (unless `identify` is false), one `/ping` group, and the error handler. */
function appWith(access: Access, meter: Meter = noMeter, identify = true) {
  const app = express()
  if (identify) app.use(identifyCaller(apiKey))
  mountRoutes(app, [{ path: '/ping', access, router: pingRouter() }], meter)
  app.use(createErrorHandler(createCapturedLogger().logger))
  return app
}

describe('mountRoutes', () => {
  it('mounts a public group (API-15)', async () => {
    const response = await request(appWith('public')).get('/ping')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('ignores a wrong key on a public group (D-95)', async () => {
    const response = await request(appWith('public')).get('/ping').set(apiKeyHeader, 'wrong')

    expect(response.status).toBe(200)
  })

  const withKey: Access = { permission: 'registrations.write', apiKey: true }
  const noKey: Access = { permission: 'scores.write' }

  it.each<Access>([withKey, noKey])(
    'answers 401 with no key on a %j group (API-16)',
    async (access) => {
      const response = await request(appWith(access)).get('/ping')

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ message: 'Missing or invalid credentials.' })
    },
  )

  it.each<Access>([withKey, noKey])(
    'answers 401 with a wrong key on a %j group (API-16)',
    async (access) => {
      const response = await request(appWith(access)).get('/ping').set(apiKeyHeader, `${apiKey}x`)

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ message: 'Missing or invalid credentials.' })
    },
  )

  it('lets the API key into a group that accepts it, with no permission check (D-96)', async () => {
    const response = await request(appWith(withKey)).get('/ping').set(apiKeyHeader, apiKey)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it.each<Access>([noKey, { permission: 'registrations.write', apiKey: false }])(
    'answers 403 to the API key on a %j group, which does not accept it (D-96)',
    async (access) => {
      const response = await request(appWith(access)).get('/ping').set(apiKeyHeader, apiKey)

      expect(response.status).toBe(403)
      expect(response.body).toEqual({ message: 'You do not have permission to do this.' })
    },
  )

  it('treats a request as anonymous when no caller was identified', async () => {
    const app = appWith(withKey, noMeter, false)

    const response = await request(app).get('/ping').set(apiKeyHeader, apiKey)

    expect(response.status).toBe(401)
  })

  it('checks every path under a protected group, not only its root', async () => {
    const response = await request(appWith(withKey)).get('/ping/anything')

    expect(response.status).toBe(401)
  })

  it.each<[string, unknown]>([
    ['no access label', undefined],
    ['an unknown label', 'admin'],
    ['null', null],
    ['an unknown permission', { permission: 'everything.write' }],
    ['an object with no permission', { role: 'admin' }],
    ['the retired caller label', 'caller'],
    ['apiKey that is not true or false', { permission: 'scores.write', apiKey: 'yes' }],
  ])('stops startup for a group with %s (API-15)', (_name, access) => {
    // Bypasses the type check, as plain JavaScript or a bad cast would.
    const group = { path: '/ping', access, router: pingRouter() } as unknown as RouteGroup

    expect(() => {
      mountRoutes(express(), [group], noMeter)
    }).toThrow('Route group "/ping" needs an access label')
  })

  describe('failure metric', () => {
    function setup(access: Access, identify = true) {
      const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
      const provider = new MeterProvider({
        readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 })],
      })
      const app = appWith(access, provider.getMeter('test'), identify)
      /** Count per reason, from `tournament_director.auth.failures`. */
      async function find() {
        await provider.forceFlush()
        return exporter
          .getMetrics()
          .flatMap((data) => data.scopeMetrics)
          .flatMap((scope) => scope.metrics)
          .findLast((m) => m.descriptor.name === 'tournament_director.auth.failures')
      }
      async function failures(): Promise<Record<string, number>> {
        const metric = await find()
        const counts: Record<string, number> = {}
        for (const point of metric?.dataPoints ?? []) {
          counts[String(point.attributes['reason'])] = Number(point.value)
        }
        return counts
      }
      return { app, failures, find }
    }

    it('counts each turned-away request by reason', async () => {
      const { app, failures } = setup(noKey)

      await request(app).get('/ping')
      await request(app).get('/ping').set(apiKeyHeader, 'wrong')
      await request(app).get('/ping').set(apiKeyHeader, 'wrong')
      await request(app).get('/ping').set(apiKeyHeader, apiKey)

      expect(await failures()).toEqual({ missing_credentials: 1, invalid_key: 2, forbidden: 1 })
    })

    it('names its unit and says what it counts', async () => {
      const { app, find } = setup(withKey)

      await request(app).get('/ping')

      expect((await find())?.descriptor).toMatchObject({
        unit: '{request}',
        description: 'Requests turned away for who they are: a 401 or 403, or a failed sign-in.',
      })
    })

    it('counts a key as missing, not invalid, when no caller was identified', async () => {
      const { app, failures } = setup(withKey, false)

      await request(app).get('/ping').set(apiKeyHeader, 'wrong')

      expect(await failures()).toEqual({ missing_credentials: 1 })
    })

    it('counts nothing for a request let in, or for a public group', async () => {
      const caller = setup(withKey)
      const open = setup('public')

      await request(caller.app).get('/ping').set(apiKeyHeader, apiKey)
      await request(open.app).get('/ping').set(apiKeyHeader, 'wrong')

      expect(await caller.failures()).toEqual({})
      expect(await open.failures()).toEqual({})
    })
  })
})
