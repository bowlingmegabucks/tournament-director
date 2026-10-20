import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { checkHealth } from './api'

describe('checkHealth', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('resolves when the API reports ok', async () => {
    await expect(checkHealth()).resolves.toBeUndefined()
  })

  it('reports the status when the API fails', async () => {
    server.use(http.get('/api/health', () => new HttpResponse(null, { status: 503 })))

    await expect(checkHealth()).rejects.toThrow('API health check failed (503)')
  })

  it('says the API is unreachable when the request fails', async () => {
    server.use(http.get('/api/health', () => HttpResponse.error()))

    await expect(checkHealth()).rejects.toThrow('Could not reach the API')
  })

  it('rejects a body that is not JSON', async () => {
    server.use(http.get('/api/health', () => new HttpResponse('<html></html>')))

    await expect(checkHealth()).rejects.toThrow('unexpected response')
  })

  it.each([
    ['null', null],
    ['a string', 'ok'],
    ['an empty object', {}],
    ['a different status', { status: 'down' }],
  ])('rejects a body that is %s', async (_label, body) => {
    server.use(http.get('/api/health', () => HttpResponse.json(body)))

    await expect(checkHealth()).rejects.toThrow('unexpected response')
  })

  it('fails with "forced failure" when development mode rolls a failure', async () => {
    vi.stubEnv('MODE', 'development')
    vi.spyOn(Math, 'random').mockReturnValue(0)

    await expect(checkHealth()).rejects.toThrow('forced failure')
  })

  it('calls the API when development mode rolls a success', async () => {
    vi.stubEnv('MODE', 'development')
    vi.spyOn(Math, 'random').mockReturnValue(0.99)

    await expect(checkHealth()).resolves.toBeUndefined()
  })
})
