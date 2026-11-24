import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  let systemIsDark = false
  let systemThemeQuery: EventTarget

  beforeEach(() => {
    systemIsDark = false
    systemThemeQuery = new EventTarget()
    Object.defineProperty(systemThemeQuery, 'matches', {
      get: () => systemIsDark,
      configurable: true,
    })
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => systemThemeQuery),
    )
    localStorage.removeItem('tournament-director-theme')
    document.documentElement.dataset.theme = 'system'
  })

  afterEach(() => {
    cleanup()
    localStorage.removeItem('tournament-director-theme')
    delete document.documentElement.dataset.theme
    vi.unstubAllGlobals()
  })

  it('follows system theme changes by default', () => {
    render(<ThemeToggle />)
    const toggle = screen.getByRole('switch', { name: 'Dark mode' })

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(document.documentElement).toHaveAttribute('data-theme', 'system')

    systemIsDark = true
    const change = new Event('change')
    Object.defineProperty(change, 'matches', { value: true })
    act(() => {
      systemThemeQuery.dispatchEvent(change)
    })

    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement).toHaveAttribute('data-theme', 'system')
  })

  it('toggles and remembers the chosen theme', async () => {
    systemIsDark = true
    const { unmount } = render(<ThemeToggle />)
    const toggle = screen.getByRole('switch', { name: 'Dark mode' })

    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem('tournament-director-theme')).toBe('light')

    unmount()
    render(<ThemeToggle />)
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })
})
