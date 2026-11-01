import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createTestApp } from '../../test/testApp.ts'
import { meSchema } from './types.ts'

describe('GET /v1/me', () => {
  it('names the API key, which holds no permissions (API-17, D-96)', async () => {
    const response = await request(createTestApp()).get('/v1/me').set(apiKeyHeader, testApiKey)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ type: 'apiKey', permissions: [] })
    expect(meSchema.parse(response.body)).toEqual(response.body)
  })

  it('answers anonymous with no key (API-17)', async () => {
    const response = await request(createTestApp()).get('/v1/me')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ type: 'anonymous', permissions: [] })
  })

  it.each(['wrong-key', '', testApiKey.toUpperCase()])(
    'answers anonymous, not 401, for the wrong key %j (D-95)',
    async (key) => {
      const response = await request(createTestApp()).get('/v1/me').set(apiKeyHeader, key)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ type: 'anonymous', permissions: [] })
    },
  )

  it('tells browsers and proxies not to keep the answer', async () => {
    const response = await request(createTestApp()).get('/v1/me')

    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('logs the caller type on the request line, and never the key (D-95)', async () => {
    const { logger, records } = createCapturedLogger()
    const app = createTestApp({ logger })

    await request(app).get('/v1/me').set(apiKeyHeader, testApiKey)
    await request(app).get('/v1/me')

    const lines = records().filter((line) => line['msg'] === 'Request completed')
    expect(lines.map((line) => line['callerType'])).toEqual(['apiKey', 'anonymous'])
    expect(JSON.stringify(records())).not.toContain(testApiKey)
  })
})
