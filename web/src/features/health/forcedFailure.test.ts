import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldForceFailure } from './forcedFailure'

describe('shouldForceFailure', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails below the 50% line in development', () => {
    vi.stubEnv('MODE', 'development')

    expect(shouldForceFailure(() => 0.49)).toBe(true)
  })

  it('succeeds at and above the 50% line in development', () => {
    vi.stubEnv('MODE', 'development')

    expect(shouldForceFailure(() => 0.5)).toBe(false)
  })

  it.each(['test', 'production'])('never fails in %s mode', (mode) => {
    vi.stubEnv('MODE', mode)

    expect(shouldForceFailure(() => 0)).toBe(false)
  })
})
