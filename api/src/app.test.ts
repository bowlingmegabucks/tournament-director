import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createInMemoryTournamentRepository } from './features/tournaments/repository.ts'
import { createConfig, createTournaments } from './test/factories.ts'
import { createCapturedLogger } from './test/logger.ts'
import { createTestApp } from './test/testApp.ts'

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
  it.each(['squads', 'sweepers'])('serves the %s lane page as public (D-59)', async (kind) => {
    const response = await request(createTestApp()).get(
      `/v1/tournaments/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01/${kind}/7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a02/lanes`,
    )

    // 404 from the tournament lookup, not from a missing route: the route is mounted.
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('does not serve the old demo path', async () => {
    const response = await request(createTestApp()).get('/tournaments')

    expect(response.status).toBe(404)
  })
})
