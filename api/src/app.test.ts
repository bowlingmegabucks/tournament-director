import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createInMemoryTournamentRepository } from './features/tournaments/repository.ts'
import { createConfig, createTournaments } from './test/factories.ts'
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
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const app = createTestApp({
      tournaments: { list: () => Promise.reject(new Error('db password is hunter2')) },
    })

    const response = await request(app).get('/tournaments')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error' })
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('app wiring', () => {
  it('serves the repository it was given', async () => {
    const tournaments = createTournaments(2)
    const app = createTestApp({ tournaments: createInMemoryTournamentRepository(tournaments) })

    const response = await request(app).get('/tournaments')

    expect(response.body).toEqual(tournaments)
  })
})
