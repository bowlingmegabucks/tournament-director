import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('uses defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual({ port: 3000, corsOrigins: [] })
  })

  it('reads the port as a number', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080)
  })

  it('splits CORS_ORIGIN on commas and trims blanks', () => {
    const config = loadConfig({ CORS_ORIGIN: ' https://a.example , https://b.example ,, ' })
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://b.example'])
  })

  it.each(['abc', '0', '70000', '1.5'])('rejects PORT=%s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/Invalid environment/)
  })
})
