import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createTestApp } from '../test/testApp.ts'
import { scalarBundle, specUrl } from './reference.ts'

describe('GET /reference', () => {
  it('is public and shows the OpenAPI document', async () => {
    const response = await request(createTestApp()).get('/reference')

    expect(response.status).toBe(200)
    expect(response.type).toBe('text/html')
    expect(response.text).toContain('openapi/v1.json')
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

  it('keeps helmet defaults and allows only the pinned bundle', async () => {
    const response = await request(createTestApp()).get('/reference')
    const policy = String(response.headers['content-security-policy'])

    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("base-uri 'self'")
    expect(policy).toContain("frame-ancestors 'self'")
    expect(policy).toContain("script-src-attr 'none'")
    expect(policy).toContain(` ${scalarBundle};`)
    expect(scalarBundle).toMatch(
      /@scalar\/api-reference@\d+\.\d+\.\d+\/dist\/browser\/standalone\.js$/,
    )
    expect(response.text).toContain(`src="${scalarBundle}"`)
  })

  it('sets exactly the sources Scalar needs for scripts, styles, fonts, images, and calls', async () => {
    const response = await request(createTestApp()).get('/reference')
    const policy = String(response.headers['content-security-policy'])
    const sourcesOf = (directive: string) =>
      policy
        .split(';')
        .map((part) => part.trim().split(' '))
        .find(([name]) => name === directive)
        ?.slice(1)
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1]

    expect(sourcesOf('script-src')).toEqual(["'self'", `'nonce-${nonce}'`, scalarBundle])
    expect(sourcesOf('style-src')).toEqual([
      "'self'",
      "'unsafe-inline'",
      'https://cdn.jsdelivr.net',
    ])
    expect(sourcesOf('font-src')).toEqual(["'self'", 'data:', 'https://cdn.jsdelivr.net'])
    expect(sourcesOf('img-src')).toEqual(["'self'", 'data:', 'https:'])
    expect(sourcesOf('connect-src')).toEqual(["'self'"])
  })

  it('titles the page with the tournament name', async () => {
    const response = await request(createTestApp()).get('/reference')

    expect(response.text).toContain('<title>Northeast Megabuck Tournament API</title>')
  })

  it('turns telemetry off and sets no proxy', async () => {
    const response = await request(createTestApp()).get('/reference')

    expect(response.text).toMatch(/"telemetry":\s*false/)
    expect(response.text).not.toContain('proxy.scalar.com')
    expect(response.text).not.toContain('proxyUrl')
  })

  it('leaves the strict policy on every other route', async () => {
    const response = await request(createTestApp()).get('/health')

    expect(response.headers['content-security-policy']).not.toContain('cdn.jsdelivr.net')
  })
})

describe('specUrl', () => {
  it('points at the document from the page, with or without a trailing slash', () => {
    expect(specUrl({ originalUrl: '/reference' })).toBe('openapi/v1.json')
    expect(specUrl({ originalUrl: '/reference?x=/' })).toBe('openapi/v1.json')
    expect(specUrl({ originalUrl: '/reference/' })).toBe('../openapi/v1.json')
    expect(specUrl({ originalUrl: '/reference/?x=1' })).toBe('../openapi/v1.json')
  })
})
