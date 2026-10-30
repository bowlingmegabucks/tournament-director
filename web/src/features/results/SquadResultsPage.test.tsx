import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createDivisionResult,
  createSquad,
  createSquadResults,
  createSquadRow,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { DivisionResult, SquadResults } from './types'
import { RESULTS_REFRESH_MS } from './useResults'

const tournament = createTournament({ name: 'Spring Open' })

/** Serve the results of the squad they describe, with a matching squad list for the page header. */
function serve(results: SquadResults) {
  const { session } = results
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/squads', () =>
      HttpResponse.json({
        squads: [createSquad({ id: session.id, date: session.date, complete: session.complete })],
      }),
    ),
    http.get('/v1/tournaments/:id/squads/:sessionId/results', () => HttpResponse.json(results)),
  )
}

const open = (results: SquadResults, search = '') =>
  renderApp(`/tournaments/${tournament.id}/squads/${results.session.id}/results${search}`)

const row = createSquadRow
function openDivision(overrides: Partial<DivisionResult> = {}): DivisionResult {
  return createDivisionResult({
    name: 'Open',
    entries: 5,
    rows: [
      row({ name: 'Dave Kowalski', place: 1, group: 'advancer', total: 735, highGame: 258 }),
      row({ name: 'Marcus Reyes', place: 2, group: 'casher', total: 717, highGame: 250 }),
      row({ name: 'Tom Brandt', place: 3, group: 'other', total: 702, highGame: 244 }),
      row({ name: 'Jim Albright', place: 4, group: 'other', total: 692, highGame: 236 }),
    ],
    ...overrides,
  })
}

const table = async (name: string) =>
  within(await screen.findByRole('table', { name }, { timeout: 3000 }))

/** Each row of a table as the text of its cells, in the order on screen. */
const cellsOf = (view: { getAllByRole: (role: 'row') => HTMLElement[] }) =>
  view.getAllByRole('row').map((tr) => Array.from(tr.children).map((cell) => cell.textContent))

afterEach(() => {
  vi.useRealTimers()
})

describe('SquadResultsPage', () => {
  it('shows a division with its place, name, total, and high game, and the lines (RES-10, RES-11, RES-32)', async () => {
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)

    open(results)

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Open' }, { timeout: 3000 }),
    ).toBeVisible()
    const view = await table('Results for the Open division')
    expect(view.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Place',
      'Name',
      'Total',
      'HG',
    ])
    const lines = view.getAllByRole('row').map((tr) => tr.textContent)
    expect(lines).toEqual([
      'PlaceNameTotalHG',
      '1Dave Kowalski735258',
      'Cut Line',
      '2Marcus Reyes717250',
      'Cash Line',
      '3Tom Brandt702244',
      '4Jim Albright692236',
    ])
  })

  it('says "No Advancers" first when no one advances (RES-11)', async () => {
    const results = createSquadResults({
      divisions: [
        openDivision({
          rows: [
            row({ name: 'Ken Mahoney', place: 1, group: 'casher', total: 701 }),
            row({ name: 'Phil Garner', place: 2, group: 'other', total: 690 }),
          ],
        }),
      ],
    })
    serve(results)

    open(results)

    const view = await table('Results for the Open division')
    expect(view.getAllByRole('row').map((tr) => tr.textContent)).toEqual([
      'PlaceNameTotalHG',
      'No Advancers',
      '1Ken Mahoney701200',
      'Cash Line',
      '2Phil Garner690200',
    ])
  })

  it('describes the division and the squad ratios (RES-03)', async () => {
    const results = createSquadResults({
      finalsRatio: 7.5,
      cashRatio: 5,
      divisions: [openDivision()],
    })
    serve(results)

    open(results)

    expect(await screen.findByText('5 entries · Advancing 1 · Cashing 1')).toBeVisible()
    expect(screen.getByText('Finals ratio 1 in 7.5 · cash ratio 1 in 5.0')).toBeVisible()
  })

  it('tags an earlier advancer at or above the cut and explains the tag once (RW-5, D-81)', async () => {
    const results = createSquadResults({
      divisions: [
        openDivision({
          rows: [
            row({ name: 'Marcus Reyes', place: 1, group: 'advancer', total: 741 }),
            row({
              name: 'Dave Kowalski',
              place: 2,
              group: 'casher',
              total: 780,
              advancedEarlier: true,
            }),
            row({ name: 'Ray Costa', place: 3, group: 'casher', total: 701 }),
          ],
        }),
      ],
    })
    serve(results)

    open(results)

    const view = await table('Results for the Open division')
    expect(view.getAllByText('Advanced earlier')).toHaveLength(1)
    expect(
      within(view.getByRole('rowheader', { name: /Dave Kowalski/ })).getByText('Advanced earlier'),
    ).toBeVisible()
    expect(screen.getAllByText(/cannot advance again/)).toHaveLength(1)
  })

  it('shows no tag and no note when no one advanced earlier', async () => {
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)

    open(results)

    await table('Results for the Open division')
    expect(screen.queryByText('Advanced earlier')).not.toBeInTheDocument()
    expect(screen.queryByText(/cannot advance again/)).not.toBeInTheDocument()
  })

  it('says what a tie was settled on, on both sides of the line (D-14, D-16)', async () => {
    const results = createSquadResults({
      divisions: [
        openDivision({
          rows: [
            row({
              name: 'Linda Perrault',
              place: 1,
              group: 'advancer',
              total: 648,
              ties: [{ line: 'cut', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } }],
            }),
            row({
              name: 'Gail Whitmore',
              place: 2,
              group: 'casher',
              total: 648,
              ties: [{ line: 'cut', outcome: 'lost', decidedBy: { kind: 'game', rank: 1 } }],
            }),
            row({
              name: 'Rita Alvarez',
              place: 3,
              group: 'other',
              total: 610,
              ties: [{ line: 'cash', outcome: 'full', decidedBy: null }],
            }),
          ],
        }),
      ],
    })
    serve(results)

    open(results)

    const view = await table('Results for the Open division')
    expect(view.getByRole('rowheader', { name: /Linda Perrault/ })).toHaveTextContent(
      'Tied on total at the cut line. Won the spot on high game.',
    )
    expect(view.getByRole('rowheader', { name: /Gail Whitmore/ })).toHaveTextContent(
      'Tied on total at the cut line. Lost the spot on high game.',
    )
    expect(view.getByRole('rowheader', { name: /Rita Alvarez/ })).toHaveTextContent(
      'Full tie at the cash line. The director decides.',
    )
  })

  it('shows the HDCP column only when the division has a handicap (RW-2, RW-3, RES-11a)', async () => {
    const plain = createSquadResults({ divisions: [openDivision({ showHandicap: false })] })
    serve(plain)
    const { unmount } = open(plain)
    const withoutColumn = await table('Results for the Open division')
    expect(withoutColumn.queryByRole('columnheader', { name: 'HDCP' })).not.toBeInTheDocument()
    unmount()

    const handicapped = createSquadResults({
      divisions: [
        openDivision({
          showHandicap: true,
          rows: [row({ name: 'Linda Perrault', group: 'advancer', handicap: 24 })],
        }),
      ],
    })
    serve(handicapped)
    open(handicapped)
    const withColumn = await table('Results for the Open division')
    expect(withColumn.getByRole('columnheader', { name: 'HDCP' })).toBeVisible()
    expect(withColumn.getAllByRole('row')[1]).toHaveTextContent('24')
  })

  it('shows a handicap of 0 as 0 in a handicap division (RW-3)', async () => {
    const results = createSquadResults({
      divisions: [
        openDivision({
          showHandicap: true,
          rows: [
            row({ name: 'Carol Ng', group: 'advancer', handicap: 0, total: 593, highGame: 205 }),
          ],
        }),
      ],
    })
    serve(results)

    open(results)

    const view = await table('Results for the Open division')
    expect(cellsOf(view)[1]).toEqual(['1', 'Carol Ng', '593', '205', '0'])
  })

  it('shows the Games column only while game counts differ (RW-4, D-76)', async () => {
    const results = createSquadResults({
      divisions: [
        openDivision({
          showGames: true,
          rows: [
            row({ name: 'Dave Kowalski', group: 'advancer', games: 2, total: 503 }),
            row({ name: 'Paul Nguyen', group: 'other', place: 2, games: 1, total: 232 }),
          ],
        }),
      ],
    })
    serve(results)

    open(results)

    const view = await table('Results for the Open division')
    expect(view.getByRole('columnheader', { name: 'Games' })).toBeVisible()
    const first = within(view.getAllByRole('row')[1] as HTMLElement)
    expect(first.getByText('2')).toBeVisible()
  })

  it('hides the Games column when the counts match (D-76)', async () => {
    const results = createSquadResults({ divisions: [openDivision({ showGames: false })] })
    serve(results)

    open(results)

    const view = await table('Results for the Open division')
    expect(view.queryByRole('columnheader', { name: 'Games' })).not.toBeInTheDocument()
  })

  it('lists a bowler who did not finish and a no-show apart, with no place (D-75)', async () => {
    const results = createSquadResults({
      session: { ...createSquadResults().session, complete: true, games: 3 },
      divisions: [
        openDivision({
          didNotFinish: [
            {
              registrationId: 'r1',
              name: 'Bob Whitaker',
              total: 445,
              highGame: 230,
              games: 2,
              handicap: 0,
            },
          ],
          noShows: [{ registrationId: 'r2', name: 'Mike Tran' }],
        }),
      ],
    })
    serve(results)

    open(results)

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Did not finish' }, { timeout: 3000 }),
    ).toBeVisible()
    const dnf = await table('Open division, did not finish')
    expect(cellsOf(dnf)[1]).toEqual(['Bob Whitaker', '2 of 3', '445', '230'])
    expect(screen.getByRole('heading', { level: 3, name: 'No show' })).toBeVisible()
    expect(screen.getByText('Mike Tran')).toBeVisible()
  })

  it('has no sections when no one did not finish or no-showed', async () => {
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)

    open(results)

    await table('Results for the Open division')
    expect(screen.queryByRole('heading', { name: 'Did not finish' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No show' })).not.toBeInTheDocument()
  })

  it('says so when no bowler in a division has finished', async () => {
    const results = createSquadResults({
      divisions: [
        openDivision({
          rows: [],
          didNotFinish: [
            { registrationId: 'r1', name: 'Bob', total: 1, highGame: 1, games: 1, handicap: 0 },
          ],
        }),
      ],
    })
    serve(results)

    open(results)

    expect(
      await screen.findByText(
        'No bowler in this division has finished the squad.',
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('table', { name: 'Results for the Open division' }),
    ).not.toBeInTheDocument()
  })

  it('sets the page title (RES-32)', async () => {
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)

    open(results)

    await table('Results for the Open division')
    await waitFor(() => {
      expect(document.title).toBe(
        'Results · Sat 10/24/2026 9:00 AM · Spring Open · Tournament Director',
      )
    })
  })
})

describe('SquadResultsPage divisions (D-80)', () => {
  const women = createDivisionResult({
    name: 'Women',
    entries: 1,
    rows: [row({ name: 'Linda Perrault', group: 'advancer', total: 648 })],
  })
  const many = () => createSquadResults({ divisions: [openDivision(), women] })

  it('shows the first division and a list of the others with their entry counts', async () => {
    const results = many()
    serve(results)

    open(results)

    const chooser = await screen.findByRole('combobox', { name: 'Division' }, { timeout: 3000 })
    expect(
      within(chooser)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Open (5 entries)', 'Women (1 entry)'])
    expect(chooser).toHaveValue(results.divisions[0]?.id)
    expect(screen.getByRole('heading', { level: 2, name: 'Open' })).toBeVisible()
    expect(screen.queryByRole('heading', { level: 2, name: 'Women' })).not.toBeInTheDocument()
  })

  it('shows the division chosen from the list', async () => {
    const results = many()
    serve(results)
    open(results)
    const chooser = await screen.findByRole('combobox', { name: 'Division' }, { timeout: 3000 })

    await userEvent.selectOptions(chooser, 'Women (1 entry)')

    expect(screen.getByRole('heading', { level: 2, name: 'Women' })).toBeVisible()
    expect(screen.queryByRole('heading', { level: 2, name: 'Open' })).not.toBeInTheDocument()
    expect(chooser).toHaveValue(results.divisions[1]?.id)
  })

  it('opens the division named in the address (?division=)', async () => {
    const results = many()
    serve(results)

    open(results, `?division=${results.divisions[1]?.id}`)

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Women' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Division' })).toHaveValue(results.divisions[1]?.id)
  })

  it('falls back to the first division for an id that matches none', async () => {
    const results = many()
    serve(results)

    open(results, '?division=nope')

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Open' }, { timeout: 3000 }),
    ).toBeVisible()
  })

  it('has no list when there is one division', async () => {
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)

    open(results)

    await table('Results for the Open division')
    expect(screen.queryByRole('combobox', { name: 'Division' })).not.toBeInTheDocument()
  })
})

describe('SquadResultsPage states (D-77)', () => {
  it('shows loading, then the results', async () => {
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', async () => {
        await gate
        return HttpResponse.json(results)
      }),
    )

    open(results)

    expect(await screen.findByText('Loading results…', {}, { timeout: 3000 })).toBeVisible()
    release()
    await table('Results for the Open division')
  })

  it('says "No scores entered yet." when no division has an entry, not an error', async () => {
    const results = createSquadResults({ divisions: [] })
    serve(results)

    open(results)

    expect(await screen.findByText('No scores entered yet.', {}, { timeout: 3000 })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error with Try again, and recovers', async () => {
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)
    server.use(
      http.get(
        '/v1/tournaments/:id/squads/:sessionId/results',
        () => new HttpResponse(null, { status: 503 }),
      ),
    )
    open(results)

    expect(
      await screen.findByText('Failed to load results (503)', {}, { timeout: 5000 }),
    ).toBeVisible()
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', () => HttpResponse.json(results)),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await table('Results for the Open division')
  })

  it('shows an error for a body that is not the expected shape', async () => {
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', () =>
        HttpResponse.json({ divisions: 'none' }),
      ),
    )

    open(results)

    expect(
      await screen.findByText(
        'Failed to load results (unexpected response)',
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible()
  })

  it('shows the API message when the ratio cannot work (D-83)', async () => {
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', () =>
        HttpResponse.json(
          { message: "This squad's finals ratio is 0, so results cannot be worked out." },
          { status: 422 },
        ),
      ),
    )

    open(results)

    expect(
      await screen.findByText(/This squad's finals ratio is 0/, {}, { timeout: 3000 }),
    ).toBeVisible()
  })

  it('says the squad is not found for a 404', async () => {
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', () =>
        HttpResponse.json({ message: 'Squad not found' }, { status: 404 }),
      ),
    )

    open(results)

    expect(await screen.findByText('Squad not found', {}, { timeout: 3000 })).toBeVisible()
  })
})

describe('SquadResultsPage refresh (RES-34, D-79)', () => {
  it('asks again every 15 seconds and shows changed results', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)
    open(results)
    await table('Results for the Open division')
    expect(screen.queryByText('Walt Pruitt')).not.toBeInTheDocument()
    const changed = createSquadResults({
      session: results.session,
      divisions: [
        openDivision({
          rows: [row({ name: 'Walt Pruitt', place: 1, group: 'advancer', total: 800 })],
        }),
      ],
    })
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', () => HttpResponse.json(changed)),
    )

    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS + 100)

    await waitFor(() => {
      expect(screen.getByText('Walt Pruitt')).toBeVisible()
    })
  })

  it('stops asking once the squad is complete (D-10)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const results = createSquadResults({
      session: { ...createSquadResults().session, complete: true },
      divisions: [openDivision()],
    })
    serve(results)
    let asked = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', () => {
        asked += 1
        return HttpResponse.json(results)
      }),
    )
    open(results)
    await table('Results for the Open division')
    expect(asked).toBe(1)

    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS * 3)

    expect(asked).toBe(1)
  })

  it('keeps the last results on screen when a refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const results = createSquadResults({ divisions: [openDivision()] })
    serve(results)
    open(results)
    await table('Results for the Open division')
    let asked = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', () => {
        asked += 1
        return new HttpResponse(null, { status: 503 })
      }),
    )

    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS + 100)

    await waitFor(() => {
      expect(asked).toBeGreaterThan(0)
    })
    expect(screen.getByRole('table', { name: 'Results for the Open division' })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SquadResultsPage printing (RES-33, D-78)', () => {
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

  const two = () =>
    createSquadResults({
      divisions: [
        openDivision(),
        createDivisionResult({
          name: 'Women',
          entries: 1,
          rows: [row({ name: 'Linda Perrault', group: 'advancer' })],
        }),
      ],
    })

  it('Print all divisions prints every division, not only the one on screen', async () => {
    const results = two()
    serve(results)
    open(results)
    let copied = -1
    print.mockImplementation(() => {
      copied = copySections().length
    })

    await userEvent.click(
      await screen.findByRole('button', { name: 'Print all divisions' }, { timeout: 3000 }),
    )

    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })
    expect(copied).toBe(2)
    expect(document.body).toHaveAttribute('data-results-printing', '')
  })

  it('removes the print copy once the browser says printing is over', async () => {
    const results = two()
    serve(results)
    open(results)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Print all divisions' }, { timeout: 3000 }),
    )
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })

    window.dispatchEvent(new Event('afterprint'))

    await waitFor(() => {
      expect(copySections()).toHaveLength(0)
    })
    expect(document.body).not.toHaveAttribute('data-results-printing')
  })

  it('does not print again while a print is open', async () => {
    const results = two()
    serve(results)
    open(results)
    const button = await screen.findByRole(
      'button',
      { name: 'Print all divisions' },
      { timeout: 3000 },
    )

    await userEvent.click(button)
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })
    await userEvent.click(button)

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('has no print copy on the page until the button is pressed', async () => {
    const results = two()
    serve(results)

    open(results)

    await screen.findByRole('button', { name: 'Print all divisions' }, { timeout: 3000 })
    expect(copySections()).toHaveLength(0)
  })

  it('offers no print button when there is nothing to print', async () => {
    const results = createSquadResults({ divisions: [] })
    serve(results)

    open(results)

    await screen.findByText('No scores entered yet.', {}, { timeout: 3000 })
    expect(screen.queryByRole('button', { name: /Print/ })).not.toBeInTheDocument()
  })
})
