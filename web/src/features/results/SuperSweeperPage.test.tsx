import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createSuperSweeperResults,
  createSuperSweeperRow,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { SuperSweeperResults } from './types'
import { RESULTS_REFRESH_MS } from './useResults'

const tournament = createTournament({ name: 'Spring Open' })
const friday = {
  id: 'a1',
  date: '2026-10-09T19:00:00',
  games: 3,
  complete: true,
  throughGame: 3,
}
const saturday = {
  id: 'a2',
  date: '2026-10-10T19:00:00',
  games: 3,
  complete: false,
  throughGame: 2,
}

function serve(results: SuperSweeperResults | Response) {
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/super-sweeper', () =>
      results instanceof Response ? results : HttpResponse.json(results),
    ),
  )
}

const open = () => renderApp(`/tournaments/${tournament.id}/super-sweeper`)

function filled(overrides: Partial<SuperSweeperResults> = {}): SuperSweeperResults {
  return createSuperSweeperResults({
    complete: true,
    cashRatio: 2,
    entries: 4,
    cashers: 2,
    cutScore: 2040,
    sweepers: [friday, { ...saturday, complete: true }],
    rows: [
      createSuperSweeperRow({
        name: 'Dana Whitfield',
        place: 1,
        group: 'casher',
        divisionName: 'Women',
        sweeperTotals: [712, 698],
        sweeperScores: [
          [262, 230, 220],
          [240, 230, 228],
        ],
        sweeperPins: [0, 0],
        total: 1410,
      }),
      createSuperSweeperRow({
        name: 'Joe Fontaine',
        place: 2,
        group: 'casher',
        divisionName: 'Open',
        sweeperTotals: [690, 681],
        total: 1371,
        ties: [{ line: 'cash', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } }],
      }),
      createSuperSweeperRow({
        name: 'Sam Ortiz',
        place: 3,
        divisionName: 'Open',
        sweeperTotals: [605, 0],
        total: 605,
        flags: [{ kind: 'missed', sweeperId: saturday.id, gamesBowled: 0 }],
      }),
      createSuperSweeperRow({
        name: 'Lee Park',
        place: 4,
        divisionName: 'Senior',
        sweeperTotals: [390, 380],
        sweeperScores: [
          [231, 159, 0],
          [0, 0, 0],
        ],
        total: 770,
        flags: [{ kind: 'unfinished', sweeperId: friday.id, gamesBowled: 2 }],
      }),
    ],
    ...overrides,
  })
}

const table = async () =>
  within(await screen.findByRole('table', { name: 'Super sweeper results' }, { timeout: 3000 }))

afterEach(() => {
  vi.useRealTimers()
})

describe('SuperSweeperPage', () => {
  it('shows a line for each sweeper with its games, and the +/- figure and Cumulative beside them (RES-29a, D-90)', async () => {
    serve(filled())

    open()

    const view = await table()
    expect(view.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Place',
      'Name',
      'Plus or minus 200 a game',
      'Sweeper',
      'G1',
      'G2',
      'G3',
      'Total',
      'Cumulative',
    ])
    const rows = view.getAllByRole('row').slice(1)
    // Two lines for each of the four bowlers, and the cash line after the second bowler.
    expect(rows.map((tr) => tr.textContent)).toContain('Cash Line')
    expect(rows).toHaveLength(9)
    const cells = (tr: HTMLElement | undefined) =>
      Array.from(tr?.children ?? []).map((cell) => cell.textContent)
    expect(cells(rows[0])).toEqual([
      '1',
      'Dana WhitfieldWomen',
      '+210',
      'Fri 10/9',
      '262',
      '230',
      '220',
      '712',
      '1410',
    ])
    expect(cells(rows[1])).toEqual(['Sat 10/10', '240', '230', '228', '698'])
    expect(screen.getByText('4 entries · Cashing 2 · Cut score 2040')).toBeVisible()
  })

  it('spans place, name, the +/- figure, and Cumulative across the sweeper lines (RES-29a)', async () => {
    serve(filled())

    open()

    const view = await table()
    const first = view.getAllByRole('row')[1] as HTMLElement
    for (const cell of [
      within(first).getByText('1'),
      within(first).getByText('1410'),
      within(first).getByText('+210'),
    ]) {
      expect(cell).toHaveAttribute('rowspan', '2')
    }
  })

  it('shows the three handicap totals for each line when a division has bonus pins (SCR-09)', async () => {
    serve(
      filled({
        rows: [
          createSuperSweeperRow({
            name: 'Dana Whitfield',
            divisionName: 'Women',
            sweeperTotals: [630, 612],
            sweeperScores: [
              [200, 200, 200],
              [200, 200, 200],
            ],
            sweeperPins: [10, 4],
            total: 1242,
          }),
        ],
      }),
    )

    open()

    const view = await table()
    expect(view.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Place',
      'Name',
      'Plus or minus 200 a game',
      'Sweeper',
      'G1',
      'G2',
      'G3',
      'Scratch Total',
      'Total HDCP',
      'HDCP Total',
      'Cumulative',
    ])
    const rows = view.getAllByRole('row').slice(1)
    expect(Array.from(rows[0]?.children ?? []).map((cell) => cell.textContent)).toEqual([
      '1',
      'Dana WhitfieldWomen',
      '+42',
      'Fri 10/9',
      '200',
      '200',
      '200',
      '600',
      '30',
      '630',
      '1242',
    ])
    expect(Array.from(rows[1]?.children ?? []).map((cell) => cell.textContent)).toEqual([
      'Sat 10/10',
      '200',
      '200',
      '200',
      '600',
      '12',
      '612',
    ])
  })

  it('draws six game columns for sweepers of 5 and 6 games, with a dash and the game count (RES-29a)', async () => {
    serve(
      filled({
        sweepers: [
          { ...friday, games: 5 },
          { ...saturday, games: 6, complete: true },
        ],
        rows: [
          createSuperSweeperRow({
            name: 'Dana Whitfield',
            sweeperTotals: [1000, 1200],
            sweeperScores: [
              [200, 200, 200, 200, 200],
              [200, 200, 200, 200, 200, 200],
            ],
            total: 2200,
            games: 11,
          }),
        ],
      }),
    )

    open()

    const view = await table()
    const headers = view.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toContain('G6')
    const rows = view.getAllByRole('row').slice(1)
    const first = Array.from(rows[0]?.children ?? []).map((cell) => cell.textContent)
    expect(first).toEqual([
      '1',
      'Dana WhitfieldOpen',
      'EVEN',
      'Fri 10/95 games',
      '200',
      '200',
      '200',
      '200',
      '200',
      'No game\u2013',
      '1000',
      '2200',
    ])
    expect(within(rows[1] as HTMLElement).getByRole('rowheader')).toHaveTextContent(
      'Sat 10/106 games',
    )
  })

  it('says "1 entry" and "1 sweeper" for one of each', async () => {
    serve(
      filled({
        entries: 1,
        cashers: 1,
        sweepers: [friday],
        rows: [createSuperSweeperRow({ name: 'Dana Whitfield', sweeperTotals: [600] })],
      }),
    )

    open()

    expect(
      await screen.findByText('1 entry · Cashing 1 · Cut score 2040', {}, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByText('1 sweeper · cash ratio 1 in 2.0')).toBeVisible()
  })

  it('spans the cash line across every column (RES-29a)', async () => {
    serve(filled())

    open()

    const view = await table()
    expect(view.getByText('Cash Line').closest('td')).toHaveAttribute('colspan', '9')
  })

  it('reads a real total aloud (D-90)', async () => {
    serve(filled())

    open()

    const view = await table()
    expect(view.getByText('712')).not.toHaveAttribute('aria-hidden')
    expect(view.getByText('1410')).not.toHaveAttribute('aria-hidden')
  })

  it('links back to the sweepers, and sets the page title', async () => {
    serve(filled())

    open()

    await table()
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Sweepers' }),
    ).toHaveAttribute('href', `/tournaments/${tournament.id}/sweepers`)
    expect(document.title).toBe('Super sweeper results · Spring Open · Tournament Director')
    expect(screen.getByText('2 sweepers · cash ratio 1 in 2.0')).toBeVisible()
  })

  it('tags a missed and an unfinished sweeper and names it (D-90)', async () => {
    serve(filled())

    open()

    const view = await table()
    expect(view.getByText('Missed a sweeper')).toBeVisible()
    expect(view.getByText('Missed the Sat 10/10 sweeper. Scored 0 for 3 games.')).toBeVisible()
    expect(view.getByText('Did not finish a sweeper')).toBeVisible()
    expect(view.getByText('Fri 10/9 sweeper: 2 of 3 games. Scored 0 for the rest.')).toBeVisible()
  })

  it('shows a dash, read as "Not bowled yet", for an open sweeper with no score (D-90)', async () => {
    serve(
      filled({
        complete: false,
        sweepers: [friday, saturday],
        rows: [
          createSuperSweeperRow({
            name: 'Ray Dunn',
            sweeperTotals: [560, null],
            sweeperScores: [[200, 180, 180], null],
            total: 560,
          }),
        ],
      }),
    )

    open()

    const view = await table()
    expect(view.getByText('Not bowled yet')).toBeInTheDocument()
    for (const dash of view.getAllByText('–')) expect(dash).toHaveAttribute('aria-hidden', 'true')
  })

  it('names the tie at the cash line (D-93)', async () => {
    serve(filled())

    open()

    expect(
      await screen.findByText(
        'Tied on total at the cash line. Won the spot on high game.',
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible()
  })

  it('says "No scores entered yet." with no rows, and offers no print button', async () => {
    serve(createSuperSweeperResults())

    open()

    expect(await screen.findByText('No scores entered yet.', {}, { timeout: 3000 })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Print results' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('marks the results unofficial until every sweeper is complete (SS-13, D-88)', async () => {
    serve(filled({ complete: false }))
    const view = open()

    expect(await screen.findByText(/can still change/, {}, { timeout: 3000 })).toHaveTextContent(
      'Unofficial results. Not every sweeper is complete, so scores and places can still change.',
    )
    view.unmount()

    serve(filled({ complete: true }))
    open()

    await table()
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

    await table()
  })

  it('shows the API message when the cash ratio is the legacy 0 (SS-10, D-17)', async () => {
    serve(
      HttpResponse.json(
        {
          message:
            "This tournament's super sweeper cash ratio is 0, so results cannot be worked out. Set a ratio of 1 or more.",
        },
        { status: 422 },
      ),
    )

    open()

    expect(
      await screen.findByText(/super sweeper cash ratio is 0/, {}, { timeout: 3000 }),
    ).toBeVisible()
  })

  it('shows loading words while the request is out', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/super-sweeper', async () => {
        await gate
        return HttpResponse.json(filled())
      }),
    )

    open()

    expect(
      await screen.findByText('Loading super sweeper results…', {}, { timeout: 3000 }),
    ).toBeVisible()
    release()
    await table()
  })

  it('asks again every 15 seconds until every sweeper is complete (D-88)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    serve(filled({ complete: false }))
    open()
    await table()
    let asked = 0
    server.use(
      http.get('/v1/tournaments/:id/super-sweeper', () => {
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

describe('SuperSweeperPage printing (RPT-04b, D-89)', () => {
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

  it('Print results prints the list in one section with the title and the unofficial mark', async () => {
    serve(filled({ complete: false }))
    open()
    let sections = -1
    let text = ''
    print.mockImplementation(() => {
      sections = copySections().length
      text = copySections()[0]?.textContent ?? ''
    })

    await userEvent.click(
      await screen.findByRole('button', { name: 'Print results' }, { timeout: 3000 }),
    )

    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })
    expect(sections).toBe(1)
    expect(text).toContain('Super Sweeper Results')
    expect(text).toContain('UNOFFICIAL RESULTS')
    expect(text).toContain('4 entries · Cashing 2 · Cut score 2040')
  })

  it('prints "1 entry" for one', async () => {
    serve(filled({ entries: 1, rows: [createSuperSweeperRow({ sweeperTotals: [600, 600] })] }))
    open()
    let text = ''
    print.mockImplementation(() => {
      text = copySections()[0]?.textContent ?? ''
    })

    await userEvent.click(
      await screen.findByRole('button', { name: 'Print results' }, { timeout: 3000 }),
    )

    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })
    expect(text).toContain('1 entry · Cashing 2')
  })

  it('prints no unofficial mark once every sweeper is complete', async () => {
    serve(filled({ complete: true }))
    open()
    let text = ''
    print.mockImplementation(() => {
      text = copySections()[0]?.textContent ?? ''
    })

    await userEvent.click(
      await screen.findByRole('button', { name: 'Print results' }, { timeout: 3000 }),
    )

    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })
    expect(text).not.toContain('UNOFFICIAL')
  })
})
