import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createSweeper,
  createSweeperResults,
  createSweeperRow,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { SweeperResults } from './types'
import { RESULTS_REFRESH_MS } from './useResults'

const tournament = createTournament({ name: 'Spring Open' })

function serve(results: SweeperResults) {
  const { session } = results
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/sweepers', () =>
      HttpResponse.json({
        sweepers: [
          createSweeper({ id: session.id, date: session.date, complete: session.complete }),
        ],
      }),
    ),
    http.get('/v1/tournaments/:id/sweepers/:sessionId/results', () => HttpResponse.json(results)),
  )
}

const open = (results: SweeperResults) =>
  renderApp(`/tournaments/${tournament.id}/sweepers/${results.session.id}/results`)

function filled(overrides: Partial<SweeperResults> = {}): SweeperResults {
  return createSweeperResults({
    cashRatio: 3,
    entries: 3,
    cashers: 1,
    cutScore: 712,
    rows: [
      createSweeperRow({
        name: 'Dave Kowalski',
        place: 1,
        group: 'casher',
        total: 712,
        highGame: 256,
        divisionName: 'Open',
      }),
      createSweeperRow({
        name: 'Linda Perrault',
        place: 2,
        group: 'other',
        total: 681,
        highGame: 229,
        divisionName: 'Women',
        bonusPins: 10,
      }),
      createSweeperRow({
        name: 'Gail Whitmore',
        place: 3,
        group: 'other',
        total: 661,
        highGame: 220,
        divisionName: 'Women',
        bonusPins: 10,
        ties: [{ line: 'cash', outcome: 'lost', decidedBy: { kind: 'game', rank: 1 } }],
      }),
    ],
    ...overrides,
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('SweeperResultsPage', () => {
  it('shows one list with the division under each name and a cash line (RES-22, RES-25a, D-82)', async () => {
    const results = filled()
    serve(results)

    open(results)

    const view = within(
      await screen.findByRole('table', { name: 'Sweeper results' }, { timeout: 3000 }),
    )
    expect(view.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Place',
      'Name',
      'Total',
      'HG',
    ])
    expect(view.getAllByRole('row').map((tr) => tr.textContent)).toEqual([
      'PlaceNameTotalHG',
      '1Dave KowalskiOpen712256',
      'Cash Line',
      '2Linda PerraultWomen, +10 a game681229',
      '3Gail WhitmoreWomen, +10 a gameTied on total at the cash line. Lost the spot on high game.661220',
    ])
  })

  it('describes the sweeper: ratio, games, entries, cashers, cut score (RES-24)', async () => {
    const results = filled()
    serve(results)

    open(results)

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sweeper results' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByText('Cash ratio 1 in 3.0 · 3 games')).toBeVisible()
    expect(screen.getByText('3 entries · Cashing 1 · Cut score 712')).toBeVisible()
  })

  it('says "1 entry" for one', async () => {
    const results = filled({
      entries: 1,
      rows: [createSweeperRow({ group: 'casher' })],
      cashers: 1,
    })
    serve(results)

    open(results)

    expect(await screen.findByText(/^1 entry · /, {}, { timeout: 3000 })).toBeVisible()
  })

  it('shows no bonus pins for a division without them', async () => {
    const results = filled()
    serve(results)

    open(results)

    const view = within(
      await screen.findByRole('table', { name: 'Sweeper results' }, { timeout: 3000 }),
    )
    expect(view.getByRole('rowheader', { name: /Dave Kowalski/ })).not.toHaveTextContent('a game')
  })

  it('sets the page title', async () => {
    const results = filled()
    serve(results)

    open(results)

    await screen.findByRole('table', { name: 'Sweeper results' }, { timeout: 3000 })
    await waitFor(() => {
      expect(document.title).toBe(
        'Results · Sat 10/24/2026 6:00 PM · Spring Open · Tournament Director',
      )
    })
  })

  it('says "No scores entered yet." with no rows, not an error (D-77)', async () => {
    const results = createSweeperResults()
    serve(results)

    open(results)

    expect(await screen.findByText('No scores entered yet.', {}, { timeout: 3000 })).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error with Try again, and recovers', async () => {
    const results = filled()
    serve(results)
    server.use(
      http.get(
        '/v1/tournaments/:id/sweepers/:sessionId/results',
        () => new HttpResponse(null, { status: 500 }),
      ),
    )
    open(results)

    expect(
      await screen.findByText('Failed to load results (500)', {}, { timeout: 5000 }),
    ).toBeVisible()
    server.use(
      http.get('/v1/tournaments/:id/sweepers/:sessionId/results', () => HttpResponse.json(results)),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('table', { name: 'Sweeper results' }, { timeout: 3000 }),
    ).toBeVisible()
  })

  it('shows the API message when the ratio cannot work (D-83)', async () => {
    const results = filled()
    serve(results)
    server.use(
      http.get('/v1/tournaments/:id/sweepers/:sessionId/results', () =>
        HttpResponse.json({ message: "This sweeper's cash ratio is 0." }, { status: 422 }),
      ),
    )

    open(results)

    expect(
      await screen.findByText("This sweeper's cash ratio is 0.", {}, { timeout: 3000 }),
    ).toBeVisible()
  })

  it('shows loading words while the request is out', async () => {
    const results = filled()
    serve(results)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('/v1/tournaments/:id/sweepers/:sessionId/results', async () => {
        await gate
        return HttpResponse.json(results)
      }),
    )

    open(results)

    expect(await screen.findByText('Loading results…', {}, { timeout: 3000 })).toBeVisible()
    release()
    await screen.findByRole('table', { name: 'Sweeper results' }, { timeout: 3000 })
  })

  it('asks again every 15 seconds while the sweeper is open (RES-34, D-79)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const results = filled()
    serve(results)
    open(results)
    await screen.findByRole('table', { name: 'Sweeper results' }, { timeout: 3000 })
    const changed = filled({ cutScore: 750 })
    server.use(
      http.get('/v1/tournaments/:id/sweepers/:sessionId/results', () => HttpResponse.json(changed)),
    )

    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS + 100)

    await waitFor(() => {
      expect(screen.getByText('3 entries · Cashing 1 · Cut score 750')).toBeVisible()
    })
  })

  it('stops asking once the sweeper is complete', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const results = filled({ session: { ...filled().session, complete: true } })
    serve(results)
    let asked = 0
    server.use(
      http.get('/v1/tournaments/:id/sweepers/:sessionId/results', () => {
        asked += 1
        return HttpResponse.json(results)
      }),
    )
    open(results)
    await screen.findByRole('table', { name: 'Sweeper results' }, { timeout: 3000 })

    await vi.advanceTimersByTimeAsync(RESULTS_REFRESH_MS * 3)

    expect(asked).toBe(1)
  })
})

describe('SweeperResultsPage printing (RES-33, D-78)', () => {
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

  it('Print results prints the list in one section, then clears the copy', async () => {
    const results = filled()
    serve(results)
    open(results)
    let copied = -1
    print.mockImplementation(() => {
      copied = copySections().length
    })

    await userEvent.click(
      await screen.findByRole('button', { name: 'Print results' }, { timeout: 3000 }),
    )
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })
    expect(copied).toBe(1)

    window.dispatchEvent(new Event('afterprint'))
    await waitFor(() => {
      expect(copySections()).toHaveLength(0)
    })
  })

  it('offers no print button with no scores', async () => {
    const results = createSweeperResults()
    serve(results)

    open(results)

    await screen.findByText('No scores entered yet.', {}, { timeout: 3000 })
    expect(screen.queryByRole('button', { name: /Print/ })).not.toBeInTheDocument()
  })
})
