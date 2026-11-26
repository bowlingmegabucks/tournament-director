import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDivisionResult,
  createLiveAtLarge,
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
  vi.restoreAllMocks()
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
  it('says what games are ranked only while the session is open (RES-51)', () => {
    const rows = [createSquadRow({ scores: [200, 200, null] })]
    const sweeperRows = [createSweeperRow({ scores: [200, 200, null] })]
    const open = createSquadResults().session
    const done = { ...open, complete: true }
    const squad = (session: typeof open): LiveScreen => {
      const ranked = { ...division, rows }
      return {
        key: 'sq1:d1',
        kind: 'squad',
        results: createSquadResults({ session, divisions: [ranked] }),
        division: ranked,
      }
    }
    const sweeper = (complete: boolean): LiveScreen => {
      const results = createSweeperResults({ rows: sweeperRows, throughGame: 2 })
      return {
        key: 'sw1',
        kind: 'sweeper',
        results: { ...results, session: { ...results.session, complete } },
      }
    }
    const { rerender } = render(<ScreenSection screen={squad(open)} highlighted={false} />)
    expect(screen.getByText(/Ranked through game 2/)).toBeVisible()

    rerender(<ScreenSection screen={squad(done)} highlighted={false} />)
    expect(screen.queryByText(/Ranked through game/)).not.toBeInTheDocument()

    rerender(<ScreenSection screen={sweeper(false)} highlighted={false} />)
    expect(screen.getByText(/Ranked through game 2/)).toBeVisible()

    rerender(<ScreenSection screen={sweeper(true)} highlighted={false} />)
    expect(screen.queryByText(/Ranked through game/)).not.toBeInTheDocument()
  })

  it('shows a squad division under a heading with In progress and the games counted', () => {
    render(<ScreenSection screen={squadScreen} highlighted={false} />)

    const section = screen.getByRole('region')
    const heading = within(section).getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('In progress · Thru game 2')
    expect(within(section).getByRole('rowheader', { name: 'Ann Lee' })).toBeVisible()
  })

  it('tags a complete session Official and drops the open cues (RES-64)', () => {
    const complete: LiveScreen = {
      ...squadScreen,
      results: createSquadResults({
        session: { ...createSquadResults().session, complete: true },
        divisions: [division],
      }),
    }
    const { rerender } = render(<ScreenSection screen={complete} highlighted={false} />)
    const heading = within(screen.getByRole('region')).getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('Official')
    expect(heading).not.toHaveTextContent('Unofficial')
    expect(heading).not.toHaveTextContent('Thru game')
    const official = screen.getByRole('region').className

    rerender(<ScreenSection screen={squadScreen} highlighted={false} />)
    expect(heading).toHaveTextContent('In progress')
    expect(screen.getByRole('region').className).not.toBe(official)
  })

  it('says Unofficial, with no game count, once every game is in (RES-64)', () => {
    const full = { ...division, throughGame: squadScreen.results.session.games }
    render(<ScreenSection screen={{ ...squadScreen, division: full }} highlighted={false} />)

    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent(/^Unofficial/)
    expect(heading).not.toHaveTextContent(/In progress|game/)
    expect(screen.queryByText(/Ranked through game/)).not.toBeInTheDocument()
  })

  it('gives an open super sweeper only the Unofficial tag (RES-64)', () => {
    const done: LiveScreen = {
      ...superScreen,
      results: { ...createSuperSweeperResults(), complete: true },
    }
    const { rerender } = render(<ScreenSection screen={done} highlighted={false} />)
    const plain = screen.getByRole('region').className
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Super sweeperOfficial$/)

    const open: LiveScreen = {
      ...superScreen,
      results: { ...createSuperSweeperResults(), complete: false },
    }
    rerender(<ScreenSection screen={open} highlighted={false} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Super sweeperUnofficial$/)
    expect(screen.getByRole('region').className).toBe(plain)
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
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(96)

    render(<ScreenSection screen={squadScreen} highlighted={false} />)

    expect(screen.getByRole('region').style.getPropertyValue('--pinned')).toBe('96px')
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
  })
})

describe('ScreenSection at-large line (RES-58)', () => {
  it('hides the bar between the parts from a screen reader', () => {
    render(<ScreenSection screen={squadScreen} highlighted={false} atLarge={createLiveAtLarge()} />)

    const bar = screen.getByText('|')
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(bar.closest('p')).toHaveTextContent('At Large: +87 (HG 242) | 4 Spots')
  })

  it('draws no bar when there is no spot', () => {
    const none = createLiveAtLarge({ spots: 0, line: null })
    render(<ScreenSection screen={squadScreen} highlighted={false} atLarge={none} />)

    expect(screen.getByText('At Large: no spots yet')).toBeInTheDocument()
    expect(screen.queryByText('|')).not.toBeInTheDocument()
  })
})
