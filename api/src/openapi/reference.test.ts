import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createTestApp } from '../test/testApp.ts'

describe('GET /reference', () => {
  it('is public and shows the OpenAPI document', async () => {
    const response = await request(createTestApp()).get('/reference')

    expect(response.status).toBe(200)
    expect(response.type).toBe('text/html')
    expect(response.text).toContain('/openapi/v1.json')
  })

  it('allows its own inline script with a nonce that changes per request', async () => {
    const first = await request(createTestApp()).get('/reference')
    const second = await request(createTestApp()).get('/reference')

    const nonceOf = (policy: string) => /'nonce-([^']+)'/.exec(policy)?.[1]
    const firstNonce = nonceOf(first.headers['content-security-policy'] ?? '')
    expect(firstNonce).toBeTruthy()
    expect(first.text).toContain(`nonce="${firstNonce}"`)
    expect(firstNonce).not.toBe(nonceOf(second.headers['content-security-policy'] ?? ''))
  })

  it('leaves the strict policy on every other route', async () => {
    const response = await request(createTestApp()).get('/health')

    expect(response.headers['content-security-policy']).not.toContain('cdn.jsdelivr.net')
  })
})
