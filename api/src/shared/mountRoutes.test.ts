import { metrics, type Meter } from '@opentelemetry/api'
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import express, { Router } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCapturedLogger } from '../test/logger.ts'
import { createTestAuth, signInCookie, testPassword } from '../test/testAuth.ts'
import { apiKeyHeader, identifyCaller } from './auth/caller.ts'
import type { Auth } from './auth/createAuth.ts'
import type { Permission } from './auth/permissions.ts'
import type { RoleName } from './auth/roles.ts'
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
function appWith(
  access: Access,
  meter: Meter = noMeter,
  identify = true,
  auth: Auth = createTestAuth().auth,
) {
  const app = express()
  const { logger } = createCapturedLogger()
  if (identify) app.use(identifyCaller({ apiKey, auth, logger }))
  mountRoutes(app, [{ path: '/ping', access, router: pingRouter() }], meter)
  app.use(createErrorHandler(logger))
  return app
}

describe('mountRoutes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  describe('signed-in users (D-96, D-97)', () => {
    /** An app with one user holding `role` (none when omitted), and the cookie they sign in with. */
    async function userApp(access: Access, role?: RoleName | RoleName[]) {
      const { auth } = createTestAuth()
      await auth.api.createUser({
        body: { email: 'u@example.com', password: testPassword, name: 'U', ...(role && { role }) },
      })
      const cookie = await signInCookie(auth, 'u@example.com')
      return { app: appWith(access, noMeter, true, auth), auth, cookie }
    }

    it.each<[RoleName, Permission]>([
      ['admin', 'users.manage'],
      ['admin', 'tournaments.write'],
      ['director', 'tournaments.write'],
      ['director', 'scores.write'],
      ['scoreKeeper', 'scores.write'],
      ['scoreKeeper', 'registrations.read'],
      ['scoreKeeper', 'lanes.read'],
    ])('lets a %s into a group that needs %s', async (role, permission) => {
      const { app, cookie } = await userApp({ permission }, role)

      const response = await request(app).get('/ping').set('Cookie', cookie)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ ok: true })
    })

    it.each<[RoleName, Permission]>([
      ['director', 'users.manage'],
      ['director', 'bowlers.ssn'],
      ['scoreKeeper', 'tournaments.write'],
      ['scoreKeeper', 'registrations.write'],
      ['scoreKeeper', 'lanes.assign'],
    ])('answers 403 to a %s on a group that needs %s', async (role, permission) => {
      const { app, cookie } = await userApp({ permission }, role)

      const response = await request(app).get('/ping').set('Cookie', cookie)

      expect(response.status).toBe(403)
      expect(response.body).toEqual({ message: 'You do not have permission to do this.' })
    })

    it('answers 403, not 401, to a signed-in user with no role', async () => {
      const { app, cookie } = await userApp({ permission: 'registrations.read' })

      const response = await request(app).get('/ping').set('Cookie', cookie)

      expect(response.status).toBe(403)
    })

    it('holds a user with several roles to the union of what they grant', async () => {
      const { app, cookie } = await userApp({ permission: 'tournaments.write' }, [
        'scoreKeeper',
        'director',
      ])

      expect((await request(app).get('/ping').set('Cookie', cookie)).status).toBe(200)
    })

    it('answers 401 to a cookie that no longer matches a session', async () => {
      const { app } = await userApp({ permission: 'scores.write' }, 'admin')

      const response = await request(app)
        .get('/ping')
        .set('Cookie', 'better-auth.session_token=gone.signature')

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ message: 'Missing or invalid credentials.' })
    })

    it('answers 401 once the user is banned, without waiting for the session to end', async () => {
      const { app, auth, cookie } = await userApp({ permission: 'scores.write' }, 'admin')
      const adminCookie = cookie
      await auth.api.createUser({
        body: { email: 'v@example.com', password: testPassword, name: 'V', role: 'director' },
      })
      const second = await signInCookie(auth, 'v@example.com')
      const target = await auth.api.listUsers({
        query: { filterField: 'email', filterValue: 'v@example.com' },
        headers: new Headers({ cookie: adminCookie }),
      })
      await auth.api.banUser({
        body: { userId: target.users[0]?.id ?? '' },
        headers: new Headers({ cookie: adminCookie }),
      })

      expect((await request(app).get('/ping').set('Cookie', second)).status).toBe(401)
      expect((await request(app).get('/ping').set('Cookie', adminCookie)).status).toBe(200)
    })

    it('lets the API key in where it is accepted, and a user without the permission too if the key comes along', async () => {
      const access: Access = { permission: 'tournaments.write', apiKey: true }
      const { app, cookie } = await userApp(access, 'scoreKeeper')

      const alone = await request(app).get('/ping').set('Cookie', cookie)
      const withKey = await request(app)
        .get('/ping')
        .set('Cookie', cookie)
        .set(apiKeyHeader, apiKey)

      expect(alone.status).toBe(403)
      expect(withKey.status).toBe(200)
    })

    it('lets a user with the permission in where the API key is accepted too', async () => {
      const { app, cookie } = await userApp(
        { permission: 'tournaments.write', apiKey: true },
        'director',
      )

      expect((await request(app).get('/ping').set('Cookie', cookie)).status).toBe(200)
    })

    it('does not let the API key past a user who lacks the permission on a group that does not accept it', async () => {
      const { app, cookie } = await userApp({ permission: 'tournaments.write' }, 'scoreKeeper')

      const response = await request(app)
        .get('/ping')
        .set('Cookie', cookie)
        .set(apiKeyHeader, apiKey)

      expect(response.status).toBe(403)
    })

    it('ignores a wrong key beside a sign-in that is allowed in, as a public route does (D-95)', async () => {
      const { app, cookie } = await userApp({ permission: 'scores.write' }, 'scoreKeeper')

      const response = await request(app)
        .get('/ping')
        .set('Cookie', cookie)
        .set(apiKeyHeader, 'wrong')

      expect(response.status).toBe(200)
    })

    it('answers 403 to a user who lacks the permission, even with a wrong key beside it', async () => {
      const { app, cookie } = await userApp({ permission: 'users.manage' }, 'director')

      const response = await request(app)
        .get('/ping')
        .set('Cookie', cookie)
        .set(apiKeyHeader, 'wrong')

      expect(response.status).toBe(403)
    })

    it('checks every path under a protected group for a user too', async () => {
      const { app, cookie } = await userApp({ permission: 'users.manage' }, 'director')

      expect((await request(app).get('/ping/anything').set('Cookie', cookie)).status).toBe(403)
    })

    describe('when the session cannot be checked', () => {
      async function brokenApp(access: Access) {
        const world = await userApp(access, 'admin')
        vi.spyOn(world.auth.api, 'getSession').mockRejectedValue(new Error('database is down'))
        return world
      }

      it('answers 503, not 401, so the web app retries instead of asking to sign in', async () => {
        const { app, cookie } = await brokenApp({ permission: 'scores.write' })

        const response = await request(app).get('/ping').set('Cookie', cookie)

        expect(response.status).toBe(503)
        expect(response.body).toEqual({ message: 'Sign-in could not be checked. Try again.' })
      })

      it('answers 503 to the API key too where the group does not accept the key', async () => {
        const { app, cookie } = await brokenApp({ permission: 'scores.write' })

        const response = await request(app)
          .get('/ping')
          .set('Cookie', cookie)
          .set(apiKeyHeader, apiKey)

        expect(response.status).toBe(503)
      })

      it('still lets the API key in where it is accepted', async () => {
        const { app, cookie } = await brokenApp({ permission: 'scores.write', apiKey: true })

        const response = await request(app)
          .get('/ping')
          .set('Cookie', cookie)
          .set(apiKeyHeader, apiKey)

        expect(response.status).toBe(200)
      })

      it('leaves a public group alone', async () => {
        const { app, cookie } = await brokenApp('public')

        expect((await request(app).get('/ping').set('Cookie', cookie)).status).toBe(200)
      })
    })
  })

  describe('failure metric', () => {
    function setup(access: Access, identify = true, auth?: Auth) {
      const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
      const provider = new MeterProvider({
        readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 })],
      })
      const app = appWith(access, provider.getMeter('test'), identify, auth)
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

    it('counts a signed-in user without the permission as forbidden', async () => {
      const { auth } = createTestAuth()
      await auth.api.createUser({
        body: { email: 'u@example.com', password: testPassword, name: 'U', role: 'scoreKeeper' },
      })
      const cookie = await signInCookie(auth, 'u@example.com')
      const { app, failures } = setup({ permission: 'users.manage' }, true, auth)

      await request(app).get('/ping').set('Cookie', cookie)

      expect(await failures()).toEqual({ forbidden: 1 })
    })

    it('counts nothing for a signed-in user let in, or when the session cannot be checked', async () => {
      const { auth } = createTestAuth()
      await auth.api.createUser({
        body: { email: 'u@example.com', password: testPassword, name: 'U', role: 'admin' },
      })
      const cookie = await signInCookie(auth, 'u@example.com')
      const { app, failures } = setup({ permission: 'users.manage' }, true, auth)
      await request(app).get('/ping').set('Cookie', cookie)
      vi.spyOn(auth.api, 'getSession').mockRejectedValue(new Error('database is down'))

      const response = await request(app).get('/ping').set('Cookie', cookie)

      expect(response.status).toBe(503)
      expect(await failures()).toEqual({})
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
