import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createAtLargeDivision,
  createAtLargeResults,
  createAtLargeRow,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { AtLargeResults } from './types'
import { RESULTS_REFRESH_MS } from './useResults'

const tournament = createTournament({ name: 'Spring Open' })

function serve(results: AtLargeResults | Response) {
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/at-large', () =>
      results instanceof Response ? results : HttpResponse.json(results),
    ),
  )
}

const open = (search = '') => renderApp(`/tournaments/${tournament.id}/at-large${search}`)

function filled(overrides: Partial<AtLargeResults> = {}): AtLargeResults {
  return createAtLargeResults({
    complete: true,
    finalsRatio: 8,
    divisions: [
      createAtLargeDivision({
        name: 'Open',
        entries: 80,
        totalSpots: 10,
        squadAdvancers: 8,
        atLargeSpots: 2,
        rows: [
          createAtLargeRow({
            name: 'Joe Fontaine',
            place: 1,
            squadDate: '2026-10-09T19:00:00',
            total: 1402,
            highGame: 248,
            previousCasher: true,
          }),
          createAtLargeRow({
            name: 'Maria Lopez',
            place: 2,
            squadDate: '2026-10-10T13:00:00',
            total: 1398,
            highGame: 256,
            ties: [{ line: 'cut', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } }],
          }),
        ],
      }),
      createAtLargeDivision({
        name: 'Women',
        entries: 64,
        totalSpots: 8,
        squadAdvancers: 8,
        atLargeSpots: 0,
      }),
    ],
    ...overrides,
  })
}

const table = async (name: string) =>
  within(await screen.findByRole('table', { name }, { timeout: 3000 }))

afterEach(() => {
  vi.useRealTimers()
})

describe('AtLargePage', () => {
  it('shows the first division with its summary and the columns (RES-12, RES-17, D-89)', async () => {
    serve(filled())

    open()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'At-large' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Open' })).toBeVisible()
    expect(
      screen.getByText(
        '80 entries · 10 finals spots (ratio 8) · 8 advanced from squads · 2 at-large spots',
      ),
    ).toBeVisible()
    const view = await table('At-large results for the Open division')
    expect(view.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Place',
      'Squad',
      'Name',
      'Total',
      'HG',
      'Casher',
    ])
    const rows = view.getAllByRole('row').slice(1)
    expect(Array.from(rows[0]?.children ?? []).map((cell) => cell.textContent)).toEqual([
      '1',
      '10/09 07:00 PM',
      'Joe Fontaine',
      '1402',
      '248',
      '$ Cashed on a squad',
    ])
    expect(Array.from(rows[1]?.children ?? []).map((cell) => cell.textContent)).toEqual([
      '2',
      '10/10 01:00 PM',
      'Maria LopezTied on total at the last at-large spot. Won the spot on high game.',
      '1398',
      '256',
      '',
    ])
  })

  it('sets the page title', async () => {
    serve(filled())

    open()

    await screen.findByRole('table', {}, { timeout: 3000 })
    expect(document.title).toBe('At-large · Spring Open · Tournament Director')
  })

  it('shows one division at a time, kept in the address (D-89)', async () => {
    const results = filled()
    serve(results)
    open(`?division=${results.divisions[1]?.id ?? ''}`)

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Women' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.queryByRole('heading', { level: 2, name: 'Open' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Division' })).toHaveValue(results.divisions[1]?.id)
    expect(screen.getByRole('option', { name: 'Open (80 entries)' })).toBeInTheDocument()
  })

  it('says a division has no at-large spots (RES-13)', async () => {
    const results = filled()
    serve(results)
    open(`?division=${results.divisions[1]?.id ?? ''}`)

    expect(
      await screen.findByText('No at-large spots in this division.', {}, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says when spots are open and nobody has qualified yet', async () => {
    serve(
      createAtLargeResults({
        divisions: [createAtLargeDivision({ entries: 16, totalSpots: 2, atLargeSpots: 2 })],
      }),
    )

    open()

    expect(
      await screen.findByText(
        'No one has qualified for an at-large spot yet.',
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible()
  })

  it('says "No scores entered yet." with no divisions, not an error', async () => {
    serve(createAtLargeResults())

    open()

    expect(await screen.findByText('No scores entered yet.', {}, { timeout: 3000 })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Print/ })).not.toBeInTheDocument()
  })

  it('marks the results unofficial until every squad is complete (D-84, D-88)', async () => {
    serve(filled({ complete: false }))
    const view = open()

    expect(await screen.findByText(/can still change/, {}, { timeout: 3000 })).toHaveTextContent(
      'Unofficial results. Not every squad is complete, so scores and places can still change.',
    )
    view.unmount()

    serve(filled({ complete: true }))
    open()

    await screen.findByRole('table', {}, { timeout: 3000 })
    expect(screen.queryByText(/Unofficial results/)).not.toBeInTheDocument()
  })

  it('shows an error with Try again, and recovers', async () => {
    serve(new HttpResponse(null, { status: 500 }))
    open()

    expect(
      await screen.findByText('Failed to load results (500)', {}, { timeout: 5000 }),
    ).toBeVisible()
    serve(filled())
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await table('At-large results for the Open division')).toBeTruthy()
  })

  it('shows the API message when the ratio cannot work (D-93)', async () => {
    serve(
      HttpResponse.json(
        { message: "This tournament's finals ratio is 0, so results cannot be worked out." },
        { status: 422 },
      ),
    )

    open()

    expect(
      await screen.findByText(
        /finals ratio is 0, so results cannot be worked out/,
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible()
  })

  it('shows loading words while the request is out', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/at-large', async () => {
        await gate
        return HttpResponse.json(filled())
      }),
    )

    open()

    expect(
      await screen.findByText('Loading at-large results…', {}, { timeout: 3000 }),
    ).toBeVisible()
    release()
    await screen.findByRole('table', {}, { timeout: 3000 })
  })

  it('asks again every 15 seconds until every squad is complete (D-88)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    serve(filled({ complete: false }))
    open()
    await screen.findByRole('table', {}, { timeout: 3000 })
    let asked = 0
    server.use(
      http.get('/v1/tournaments/:id/at-large', () => {
        asked += 1
        return HttpResponse.json(filled({ complete: true, finalsRatio: 9 }))
      }),
    )

    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS + 100)
    await waitFor(() => {
      expect(asked).toBe(1)
    })
    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS * 3)

    // Once complete, it stops.
    expect(asked).toBe(1)
    expect(screen.queryByText(/Unofficial results/)).not.toBeInTheDocument()
  })
})

describe('AtLargePage printing (RPT-04c, D-89)', () => {
  let print: ReturnType<typeof vi.fn>
  const copySections = () => document.querySelectorAll('[data-results-print-copy] > section')
  const copyTitles = () =>
    Array.from(copySections()).map((section) => section.querySelector('h1')?.textContent)

  beforeEach(() => {
    print = vi.fn()
    vi.stubGlobal('print', print)
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete document.body.dataset.resultsPrinting
  })

  it('Print all divisions puts every division in the copy, one section each', async () => {
    serve(filled())
    open()
    let sections: (string | undefined | null)[] = []
    print.mockImplementation(() => {
      sections = copyTitles()
    })

    await userEvent.click(
      await screen.findByRole('button', { name: 'Print all divisions' }, { timeout: 3000 }),
    )

    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })
    expect(sections).toEqual(['At Large', 'At Large'])
  })

  it('Print this division prints only the chosen division', async () => {
    const results = filled()
    serve(results)
    open(`?division=${results.divisions[1]?.id ?? ''}`)
    let labels: string[] = []
    print.mockImplementation(() => {
      labels = Array.from(copySections()).map((section) => section.getAttribute('aria-label') ?? '')
    })

    await userEvent.click(
      await screen.findByRole('button', { name: 'Print this division' }, { timeout: 3000 }),
    )

    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })
    expect(labels).toEqual(['Women division'])
  })

  it('prints "UNOFFICIAL RESULTS" while a squad is open, and nothing once all are complete (D-88)', async () => {
    serve(filled({ complete: false }))
    const view = open()
    let marks = -1
    print.mockImplementation(() => {
      marks = document
        .querySelectorAll('[data-results-print-copy] section')[0]
        ?.textContent?.includes('UNOFFICIAL RESULTS')
        ? 1
        : 0
    })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Print all divisions' }, { timeout: 3000 }),
    )
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })
    expect(marks).toBe(1)
    window.dispatchEvent(new Event('afterprint'))
    view.unmount()

    serve(filled({ complete: true }))
    open()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Print all divisions' }, { timeout: 3000 }),
    )
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(2)
    })
    expect(marks).toBe(0)
  })
})
