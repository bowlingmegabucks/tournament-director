import { trace, type Span } from '@opentelemetry/api'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testApiKey } from '../../test/factories.ts'
import { createTestApp } from '../../test/testApp.ts'
import { apiKeyHeader } from './caller.ts'

describe('identifyCaller', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['apiKey', testApiKey],
    ['anonymous', 'wrong-key'],
  ])('puts the caller type %s on the active trace span (D-95)', async (type, key) => {
    const setAttribute = vi.fn()
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({ setAttribute } as unknown as Span)

    await request(createTestApp()).get('/v1/me').set(apiKeyHeader, key)

    expect(setAttribute).toHaveBeenCalledWith('caller.type', type)
  })
})
