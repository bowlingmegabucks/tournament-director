import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyThemePreference,
  getThemePreference,
  initializeTheme,
  saveThemePreference,
} from './theme'

const storageKey = 'tournament-director-theme'

describe('theme storage', () => {
  beforeEach(() => {
    localStorage.removeItem(storageKey)
    document.documentElement.dataset.theme = 'system'
  })

  afterEach(() => {
    localStorage.removeItem(storageKey)
    document.documentElement.dataset.theme = 'system'
    vi.restoreAllMocks()
  })

  it('reads a saved light or dark choice', () => {
    localStorage.setItem(storageKey, 'dark')
    expect(getThemePreference()).toBe('dark')

    localStorage.setItem(storageKey, 'light')
    expect(getThemePreference()).toBe('light')
  })

  it('falls back to system for nothing saved or an unknown value', () => {
    expect(getThemePreference()).toBe('system')

    localStorage.setItem(storageKey, 'sepia')
    expect(getThemePreference()).toBe('system')
  })

  it('falls back to system when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })

    expect(getThemePreference()).toBe('system')
  })

  it('applies a preference to the page', () => {
    applyThemePreference('light')
    expect(document.documentElement.dataset.theme).toBe('light')

    applyThemePreference('system')
    expect(document.documentElement.dataset.theme).toBe('system')
  })

  it('applies the saved preference on start-up', () => {
    localStorage.setItem(storageKey, 'dark')

    initializeTheme()

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('saves a choice and applies it', () => {
    saveThemePreference('light')

    expect(localStorage.getItem(storageKey)).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('still applies a choice when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    saveThemePreference('dark')

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(storageKey)).toBeNull()
  })
})
