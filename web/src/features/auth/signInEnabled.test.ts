import { afterEach, describe, expect, it, vi } from 'vitest'
import { signInEnabled } from './signInEnabled'

describe('signInEnabled', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is on in development and tests', () => {
    expect(signInEnabled()).toBe(true)
  })

  it('is off in a production build without the flag', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_SHOW_SIGN_IN', '')

    expect(signInEnabled()).toBe(false)
  })

  it('is on in a production build with the flag', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_SHOW_SIGN_IN', 'true')

    expect(signInEnabled()).toBe(true)
  })
})
