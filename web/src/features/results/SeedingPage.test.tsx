import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createSeedingDivision,
  createSeedingResults,
  createSeedingRow,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { SeedingResults } from './types'
import { RESULTS_REFRESH_MS } from './useResults'

const tournament = createTournament({ name: 'Spring Open' })

function serve(results: SeedingResults | Response) {
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/seeding', () =>
      results instanceof Response ? results : HttpResponse.json(results),
    ),
  )
}

const open = (search = '') => renderApp(`/tournaments/${tournament.id}/seeding${search}`)

function filled(overrides: Partial<SeedingResults> = {}, handicap = true): SeedingResults {
  return createSeedingResults({
    complete: true,
    divisions: [
      createSeedingDivision({
        name: 'Open',
        entries: 80,
        finalists: 3,
        atLarge: 1,
        showHandicap: handicap,
        rows: [
          createSeedingRow({
            name: 'Dana Whitfield',
            seed: 1,
            squadDate: '2026-10-10T13:00:00',
            total: 1512,
            highGame: 279,
            handicap: 12,
          }),
          createSeedingRow({
            name: 'Joe Fontaine',
            seed: 2,
            squadDate: '2026-10-09T19:00:00',
            total: 1498,
            highGame: 255,
            handicap: 8,
            previousCasher: true,
            ties: [{ line: 'cut', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } }],
          }),
          createSeedingRow({
            name: 'Sam Ortiz',
            seed: 3,
            squadDate: '2026-10-09T13:00:00',
            total: 1210,
            highGame: 220,
          }),
          createSeedingRow({
            name: 'Lee Park',
            seed: 4,
            group: 'other',
            squadDate: '2026-10-09T13:00:00',
            total: 1190,
            highGame: 215,
          }),
        ],
      }),
      createSeedingDivision({ name: 'Women', entries: 10, finalists: 1, rows: [] }),
    ],
    ...overrides,
  })
}

const table = async (name: string) =>
  within(await screen.findByRole('table', { name }, { timeout: 3000 }))

afterEach(() => {
  vi.useRealTimers()
})

describe('SeedingPage', () => {
  it('lists the seeds, the squad of each best entry, and a cut line (RES-18 to RES-21a, D-92)', async () => {
    serve(filled())

    open()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Finals seeding' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByText('3 finalists (2 from squads, 1 at-large) · 1 other')).toBeVisible()
    const view = await table('Finals seeding for the Open division')
    expect(view.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Seed',
      'Squad',
      'Name',
      'Total',
      'HG',
      'HDCP',
      'Casher',
    ])
    const lines = view.getAllByRole('row').slice(1)
    expect(lines.map((tr) => Array.from(tr.children).map((cell) => cell.textContent))).toEqual([
      ['#1', '10/10 01:00 PM', 'Dana Whitfield', '1512', '279', '12', ''],
      [
        '#2',
        '10/09 07:00 PM',
        'Joe FontaineTied on total at the cut line. Won the spot on high game.',
        '1498',
        '255',
        '8',
        '$ Cashed on a squad',
      ],
      ['#3', '10/09 01:00 PM', 'Sam Ortiz', '1210', '220', '0', ''],
      ['Cut Line'],
      ['#4', '10/09 01:00 PM', 'Lee Park', '1190', '215', '0', ''],
    ])
  })

  it('spans the cut line across every column, with and without HDCP (D-92)', async () => {
    serve(filled())
    const view = open()
    expect(
      (await screen.findByText('Cut Line', {}, { timeout: 3000 })).closest('td'),
    ).toHaveAttribute('colspan', '7')
    view.unmount()

    serve(filled({}, false))
    open()

    expect(
      (await screen.findByText('Cut Line', {}, { timeout: 3000 })).closest('td'),
    ).toHaveAttribute('colspan', '6')
  })

  it('leaves out the HDCP column when nobody has a handicap (D-92)', async () => {
    serve(filled({}, false))

    open()

    const view = await table('Finals seeding for the Open division')
    expect(view.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Seed',
      'Squad',
      'Name',
      'Total',
      'HG',
      'Casher',
    ])
  })

  it('sets the page title', async () => {
    serve(filled())

    open()

    await screen.findByRole('table', {}, { timeout: 3000 })
    expect(document.title).toBe('Finals seeding · Spring Open · Tournament Director')
  })

  it('shows one division at a time, kept in the address (D-89)', async () => {
    const results = filled()
    serve(results)
    open(`?division=${results.divisions[1]?.id ?? ''}`)

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Women' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Division' })).toHaveValue(results.divisions[1]?.id)
  })

  it('says "No scores entered yet." with no divisions', async () => {
    serve(createSeedingResults())

    open()

    expect(await screen.findByText('No scores entered yet.', {}, { timeout: 3000 })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Print/ })).not.toBeInTheDocument()
  })

  it('marks the seeding unofficial until every squad is complete (SD-7, D-88)', async () => {
    serve(filled({ complete: false }))
    const view = open()

    expect(await screen.findByText(/can still change/, {}, { timeout: 3000 })).toHaveTextContent(
      'Unofficial results. Not every squad is complete, so scores and seeds can still change.',
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

    expect(await table('Finals seeding for the Open division')).toBeTruthy()
  })

  it('shows loading words while the request is out', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/seeding', async () => {
        await gate
        return HttpResponse.json(filled())
      }),
    )

    open()

    expect(await screen.findByText('Loading seeding…', {}, { timeout: 3000 })).toBeVisible()
    release()
    await screen.findByRole('table', {}, { timeout: 3000 })
  })

  it('asks again every 15 seconds until every squad is complete, and keeps the last results on a failed refresh (D-88)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    serve(filled({ complete: false }))
    open()
    await screen.findByRole('table', {}, { timeout: 3000 })
    server.use(
      http.get('/v1/tournaments/:id/seeding', () => new HttpResponse(null, { status: 500 })),
    )

    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS + 100)

    expect(
      screen.getByRole('table', { name: 'Finals seeding for the Open division' }),
    ).toBeVisible()
    let asked = 0
    server.use(
      http.get('/v1/tournaments/:id/seeding', () => {
        asked += 1
        return HttpResponse.json(filled({ complete: true }))
      }),
    )
    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS + 100)
    await waitFor(() => {
      expect(asked).toBe(1)
    })
    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS * 3)
    expect(asked).toBe(1)
  })
})

describe('SeedingPage printing (RPT-04d, D-89)', () => {
  let print: ReturnType<typeof vi.fn>
  const copySections = () => document.querySelectorAll('[data-results-print-copy] > section')

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

  it('Print all divisions puts each division in its own section, titled Finals Seeding', async () => {
    serve(filled({ complete: false }))
    open()
    let headings: (string | null | undefined)[] = []
    let unofficial = false
    print.mockImplementation(() => {
      headings = Array.from(copySections()).map(
        (section) => section.querySelector('h1')?.textContent,
      )
      unofficial = copySections()[0]?.textContent?.includes('UNOFFICIAL RESULTS') ?? false
    })

    await userEvent.click(
      await screen.findByRole('button', { name: 'Print all divisions' }, { timeout: 3000 }),
    )

    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })
    expect(headings).toEqual(['Finals Seeding', 'Finals Seeding'])
    expect(unofficial).toBe(true)
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
})
