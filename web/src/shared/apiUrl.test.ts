import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiUrl } from './apiUrl'

describe('apiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the path as is when no base URL is set', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')

    expect(apiUrl('/api/health')).toBe('/api/health')
  })

  it('puts the base URL in front of the path', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')

    expect(apiUrl('/api/health')).toBe('https://api.example.com/api/health')
  })

  it('does not double the slash when the base URL ends with one', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com//')

    expect(apiUrl('/api/health')).toBe('https://api.example.com/api/health')
  })
})
