import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDivisionResult,
  createSquadResults,
  createSquadRow,
  createSuperSweeperResults,
  createSuperSweeperRow,
  createSweeperResults,
  createSweeperRow,
} from '../../mocks/data'
import { ScreenSection } from './ScreenSection'
import type { LiveScreen } from './liveLogic'

afterEach(() => {
  vi.unstubAllGlobals()
})

const division = createDivisionResult({
  name: 'Open',
  entries: 1,
  throughGame: 2,
  rows: [createSquadRow({ name: 'Ann Lee', scores: [200, 200, null] })],
})
const squadScreen: LiveScreen = {
  key: 'sq1:d1',
  kind: 'squad',
  results: createSquadResults({ divisions: [division] }),
  division,
}
const sweeperScreen: LiveScreen = {
  key: 'sw1',
  kind: 'sweeper',
  results: createSweeperResults({ rows: [createSweeperRow({ name: 'Cal Ode' })] }),
}
const superScreen: LiveScreen = {
  key: 'super',
  kind: 'super-sweeper',
  results: createSuperSweeperResults({ rows: [createSuperSweeperRow({ name: 'Dee Park' })] }),
}

describe('ScreenSection (D-242, D-254)', () => {
  it('shows a squad division under a heading with Unofficial and the games counted', () => {
    render(<ScreenSection screen={squadScreen} highlighted={false} />)

    const section = screen.getByRole('region')
    const heading = within(section).getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('Unofficial')
    expect(heading).toHaveTextContent('Through game 2')
    expect(within(section).getByRole('rowheader', { name: 'Ann Lee' })).toBeVisible()
  })

  it('shows a sweeper with its counts and cash line', () => {
    render(<ScreenSection screen={sweeperScreen} highlighted={false} />)

    expect(screen.getByRole('rowheader', { name: /^Cal Ode/ })).toBeVisible()
    expect(screen.getByText(/Cash ratio/)).toBeVisible()
  })

  it('shows the super sweeper with its counts', () => {
    render(<ScreenSection screen={superScreen} highlighted={false} />)

    expect(screen.getByText('Dee Park')).toBeVisible()
    expect(screen.getByText(/Cash ratio/)).toBeVisible()
  })

  it('outlines the block that just changed and no other', () => {
    const { rerender } = render(<ScreenSection screen={squadScreen} highlighted={false} />)
    const plain = screen.getByRole('region').className

    rerender(<ScreenSection screen={squadScreen} highlighted />)

    expect(screen.getByRole('region').className).not.toBe(plain)
  })

  it('gives the section the height of its pinned heading, for the pinned column heads', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(96)

    render(<ScreenSection screen={squadScreen} highlighted={false} />)

    expect(screen.getByRole('region').style.getPropertyValue('--pinned')).toBe('96px')
    height.mockRestore()
  })

  it('measures again when the heading changes size, and stops watching when it goes', () => {
    let measure: () => void = () => undefined
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          measure = callback
        }
        observe() {}
        disconnect = disconnect
      },
    )
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50)
    const { unmount } = render(<ScreenSection screen={squadScreen} highlighted={false} />)

    height.mockReturnValue(80)
    measure()
    expect(screen.getByRole('region').style.getPropertyValue('--pinned')).toBe('80px')

    unmount()
    expect(disconnect).toHaveBeenCalled()
    height.mockRestore()
  })
})
