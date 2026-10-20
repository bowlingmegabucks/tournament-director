import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldForceFailure } from './forcedFailure'

function stub(env: { dev: boolean; mode: string; mocks: string }) {
  vi.stubEnv('DEV', env.dev)
  vi.stubEnv('MODE', env.mode)
  vi.stubEnv('VITE_USE_MOCKS', env.mocks)
}

describe('shouldForceFailure', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails below the 50% line under the dev server with mocks on', () => {
    stub({ dev: true, mode: 'mocks', mocks: 'true' })

    expect(shouldForceFailure(() => 0.49)).toBe(true)
  })

  it('succeeds at and above the 50% line under the dev server with mocks on', () => {
    stub({ dev: true, mode: 'mocks', mocks: 'true' })

    expect(shouldForceFailure(() => 0.5)).toBe(false)
  })

  it('never fails when mocks are off (npm run dev)', () => {
    stub({ dev: true, mode: 'development', mocks: '' })

    expect(shouldForceFailure(() => 0)).toBe(false)
  })

  it('never fails in test mode', () => {
    stub({ dev: true, mode: 'test', mocks: 'true' })

    expect(shouldForceFailure(() => 0)).toBe(false)
  })

  it('never fails in a build, even with mocks on', () => {
    stub({ dev: false, mode: 'mocks', mocks: 'true' })

    expect(shouldForceFailure(() => 0)).toBe(false)
  })
})
