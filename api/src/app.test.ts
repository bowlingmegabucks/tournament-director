import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createInMemoryTournamentRepository } from './features/tournaments/repository.ts'
import { apiKeyHeader } from './shared/auth/caller.ts'
import type { RoleName } from './shared/auth/roles.ts'
import { createConfig, createTournaments, testApiKey } from './test/factories.ts'
import { createCapturedLogger } from './test/logger.ts'
import { createTestApp } from './test/testApp.ts'
import { createTestAuth, signInCookie, testPassword } from './test/testAuth.ts'

describe('GET /health', () => {
  it('reports ok', async () => {
    const response = await request(createTestApp()).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})

describe('unknown routes', () => {
  it('return a JSON 404', async () => {
    const response = await request(createTestApp()).get('/nope')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Not found' })
  })
})

describe('security headers', () => {
  it('sets helmet headers and hides the framework name', async () => {
    const response = await request(createTestApp()).get('/health')

    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-powered-by']).toBeUndefined()
  })
})

describe('CORS', () => {
  const origin = 'https://app.example'

  it('allows a configured origin', async () => {
    const app = createTestApp({ config: createConfig({ corsOrigins: [origin] }) })

    const response = await request(app).get('/health').set('Origin', origin)

    expect(response.headers['access-control-allow-origin']).toBe(origin)
  })

  it('lets a configured origin send the sign-in cookie (D-99)', async () => {
    const app = createTestApp({ config: createConfig({ corsOrigins: [origin] }) })

    const response = await request(app).get('/health').set('Origin', origin)

    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })

  it('does not allow an origin that is not configured', async () => {
    const app = createTestApp({ config: createConfig({ corsOrigins: [origin] }) })

    const response = await request(app).get('/health').set('Origin', 'https://evil.example')

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('sends no CORS headers when none are configured', async () => {
    const response = await request(createTestApp()).get('/health').set('Origin', origin)

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('server errors', () => {
  it('turns a failing repository into a 500 without leaking the cause', async () => {
    const { logger, records } = createCapturedLogger()
    const app = createTestApp({
      logger,
      tournaments: {
        list: () => Promise.reject(new Error('db password is hunter2')),
        get: () => Promise.reject(new Error('db password is hunter2')),
        getRatios: () => Promise.reject(new Error('db password is hunter2')),
      },
    })

    const response = await request(app).get('/v1/tournaments')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error' })
    const requestId = response.headers['x-request-id']
    expect(records()).toMatchObject([
      { msg: 'Unhandled error', requestId },
      { msg: 'Request completed', status: 500, requestId },
    ])
  })
})

describe('request id', () => {
  const origin = 'https://app.example'

  it('lets a browser on an allowed origin read the header', async () => {
    const app = createTestApp({ config: createConfig({ corsOrigins: [origin] }) })

    const response = await request(app).get('/health').set('Origin', origin)

    expect(response.headers['access-control-expose-headers']).toBe('x-request-id')
  })

  it('is set on a 404', async () => {
    const response = await request(createTestApp()).get('/nope')

    expect(response.headers['x-request-id']).toBeDefined()
  })
})

describe('app wiring', () => {
  it('serves the repository it was given', async () => {
    const tournaments = createTournaments(2)
    const app = createTestApp({ tournaments: createInMemoryTournamentRepository(tournaments) })

    const response = await request(app).get('/v1/tournaments')

    expect(response.body).toEqual({ tournaments })
  })
})

describe('route access (D-27)', () => {
  it.each(['squads', 'sweepers'])(
    'serves the %s scores as public for good (D-70)',
    async (kind) => {
      const response = await request(createTestApp()).get(
        `/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/${kind}/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a02/scores`,
      )

      // 404 from the tournament lookup, not from a missing route: the route is mounted.
      expect(response.body).toEqual({ message: 'Tournament not found' })
    },
  )

  it.each(['squads', 'sweepers'])(
    'serves the %s results as public for good (D-74)',
    async (kind) => {
      const response = await request(createTestApp()).get(
        `/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/${kind}/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a02/results`,
      )

      // 404 from the tournament lookup, not from a missing route: the route is mounted.
      expect(response.body).toEqual({ message: 'Tournament not found' })
    },
  )

  it.each(['at-large', 'seeding', 'super-sweeper'])(
    'serves the %s results as public for good (D-85)',
    async (kind) => {
      const response = await request(createTestApp()).get(
        `/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/${kind}`,
      )

      // 404 from the tournament lookup, not from a missing route: the route is mounted.
      expect(response.body).toEqual({ message: 'Tournament not found' })
    },
  )

  it('does not serve the old demo path', async () => {
    const response = await request(createTestApp()).get('/tournaments')

    expect(response.status).toBe(404)
  })
})

// The routes locked down in 0.4.0 (D-52). The registration site calls none of them, so none
// accepts the API key (D-96). The tournament id and session id below do not exist: a 404 from the
// tournament lookup proves the caller got past the access check.
const tournamentId = '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'
const sessionId = '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a02'
const base = `/v1/tournaments/${tournamentId}`
const lockedRoutes = [
  ['registrations (D-46)', `${base}/registrations`],
  ['squad lanes (D-59)', `${base}/squads/${sessionId}/lanes`],
  ['sweeper lanes (D-59)', `${base}/sweepers/${sessionId}/lanes`],
  ['squad recap sheets (D-66)', `${base}/squads/${sessionId}/recap-sheets`],
  ['sweeper recap sheets (D-66)', `${base}/sweepers/${sessionId}/recap-sheets`],
] as const

describe('locked-down read routes (D-52)', () => {
  async function appWithUser(role: RoleName | undefined) {
    const { auth } = createTestAuth()
    // createTestUser defaults to admin, so a user with no role comes straight from Better Auth.
    await auth.api.createUser({
      body: {
        email: 'ada@example.com',
        password: testPassword,
        name: 'Ada',
        ...(role && { role }),
      },
    })
    const cookie = await signInCookie(auth)
    return { app: createTestApp({ auth }), cookie }
  }

  describe.each(lockedRoutes)('%s', (_name, path) => {
    it('answers 401 to a caller who proved nothing', async () => {
      const response = await request(createTestApp()).get(path)

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ message: 'Missing or invalid credentials.' })
    })

    it('answers 403 to the API key, which no vendor route needs here', async () => {
      const response = await request(createTestApp()).get(path).set(apiKeyHeader, testApiKey)

      expect(response.status).toBe(403)
      expect(response.body).toEqual({ message: 'You do not have permission to do this.' })
    })

    it('answers 403 to a signed-in user with no role', async () => {
      const { app, cookie } = await appWithUser(undefined)

      const response = await request(app).get(path).set('Cookie', cookie)

      expect(response.status).toBe(403)
    })

    it.each<RoleName>(['scoreKeeper', 'director', 'admin'])('lets a %s in', async (role) => {
      const { app, cookie } = await appWithUser(role)

      const response = await request(app).get(path).set('Cookie', cookie)

      expect(response.body).toEqual({ message: 'Tournament not found' })
    })
  })
})

describe('routes that stay public (D-09, D-70, D-74, D-85)', () => {
  it.each([
    ['tournament list (API-03)', '/v1/tournaments', 200],
    ['tournament detail (API-04)', base, 404],
    ['divisions', `${base}/divisions`, 404],
    ['squads', `${base}/squads`, 404],
    ['sweepers', `${base}/sweepers`, 404],
    ['squad scores', `${base}/squads/${sessionId}/scores`, 404],
    ['sweeper scores', `${base}/sweepers/${sessionId}/scores`, 404],
    ['squad results', `${base}/squads/${sessionId}/results`, 404],
    ['sweeper results', `${base}/sweepers/${sessionId}/results`, 404],
    ['at-large', `${base}/at-large`, 404],
    ['seeding', `${base}/seeding`, 404],
    ['super sweeper', `${base}/super-sweeper`, 404],
  ])('answers an anonymous caller on the %s route (not 401)', async (_name, path, status) => {
    const response = await request(createTestApp()).get(path)

    expect(response.status).toBe(status)
  })

  it('ignores a wrong API key on a vendor route, as the legacy API does (D-95)', async () => {
    const response = await request(createTestApp()).get('/v1/tournaments').set(apiKeyHeader, 'nope')

    expect(response.status).toBe(200)
  })
})
