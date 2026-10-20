import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldForceFailure } from './forcedFailure'

describe('shouldForceFailure', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails below the 50% line under the mocks dev server', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('MODE', 'mocks')

    expect(shouldForceFailure(() => 0.49)).toBe(true)
  })

  it('succeeds at and above the 50% line under the mocks dev server', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('MODE', 'mocks')

    expect(shouldForceFailure(() => 0.5)).toBe(false)
  })

  it.each(['development', 'test'])('never fails in %s mode', (mode) => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('MODE', mode)

    expect(shouldForceFailure(() => 0)).toBe(false)
  })

  it('never fails in a production build', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production')

    expect(shouldForceFailure(() => 0)).toBe(false)
  })
})
