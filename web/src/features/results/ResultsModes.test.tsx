import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../mocks/server'
import {
  createDivisionResult,
  createSquad,
  createSquadResults,
  createSquadRow,
  createSuperSweeperResults,
  createSuperSweeperRow,
  createSweeper,
  createSweeperResults,
  createSweeperRow,
  createTournament,
} from '../../mocks/data'
import { FakeEventSource } from '../../test/fakeEventSource'
import { renderApp } from '../../test/renderApp'
import type { RankMode, SquadResults, SuperSweeperResults, SweeperResults } from './types'

const tournament = createTournament({ name: 'Spring Open' })

/** What the API sent for each request, newest last. */
function serveSquad(answer: (mode: RankMode) => SquadResults) {
  const modes: string[] = []
  const first = answer('full-game')
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/squads', () =>
      HttpResponse.json({
        squads: [
          createSquad({
            id: first.session.id,
            date: first.session.date,
            complete: first.session.complete,
          }),
        ],
      }),
    ),
    http.get('/v1/tournaments/:id/squads/:sessionId/results', ({ request }) => {
      const mode = new URL(request.url).searchParams.get('mode') ?? ''
      modes.push(mode)
      return HttpResponse.json(answer(mode === 'live' ? 'live' : 'full-game'))
    }),
  )
  return { modes, first }
}

const openSquad = (results: SquadResults, search = '') =>
  renderApp(`/tournaments/${tournament.id}/squads/${results.session.id}/results${search}`)

const sessionId = '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a02'

/** An open four-game squad: Dana has a fourth game, Mike does not. */
function fourGames(mode: RankMode): SquadResults {
  const dana = createSquadRow({
    name: 'Dana Whitcomb',
    scores: [210, 210, 210, 300],
    total: mode === 'live' ? 930 : 630,
    games: mode === 'live' ? 4 : 3,
  })
  const mike = createSquadRow({
    name: 'Mike Orsini',
    scores: [250, 250, 250, null],
    total: 750,
    games: 3,
  })
  return createSquadResults({
    session: { ...createSquadResults().session, id: sessionId, games: 4 },
    mode,
    divisions: [
      createDivisionResult({
        name: 'Open',
        entries: 2,
        throughGame: mode === 'live' ? null : 3,
        rows:
          mode === 'live'
            ? [
                { ...dana, place: 1, group: 'advancer' },
                { ...mike, place: 2, group: 'casher' },
              ]
            : [
                { ...mike, place: 1, group: 'advancer' },
                { ...dana, place: 2, group: 'casher' },
              ],
      }),
    ],
  })
}

const ranking = () => within(screen.getByRole('group', { name: 'Ranking' }))

describe('Results tab ranking mode (RES-45, D-239)', () => {
  it('asks for the steady mode by default and labels it with the game (RES-45)', async () => {
    const { modes, first } = serveSquad(fourGames)
    openSquad(first)

    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    expect(modes).toEqual(['full-game'])
    expect(ranking().getByRole('radio', { name: 'Through game 3' })).toBeChecked()
    expect(ranking().getByRole('radio', { name: 'Live' })).not.toBeChecked()
  })

  it('asks for live results when the viewer chooses Live, and keeps it in the address (RES-45)', async () => {
    const user = userEvent.setup()
    const { modes, first } = serveSquad(fourGames)
    openSquad(first)
    const table = await screen.findByRole(
      'table',
      { name: 'Results for the Open division' },
      { timeout: 3000 },
    )
    expect(within(table).getAllByRole('rowheader')[0]).toHaveTextContent('Mike Orsini')

    await user.click(ranking().getByRole('radio', { name: 'Live' }))

    await waitFor(() => {
      expect(
        within(screen.getByRole('table', { name: 'Results for the Open division' })).getAllByRole(
          'rowheader',
        )[0],
      ).toHaveTextContent('Dana Whitcomb')
    })
    expect(modes).toContain('live')
    expect(ranking().getByRole('radio', { name: 'Live' })).toBeChecked()
  })

  it('opens live from ?mode=live and falls back to the steady mode for any other value (RES-45)', async () => {
    const { modes, first } = serveSquad(fourGames)
    const live = openSquad(first, '?mode=live')
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })
    expect(modes).toEqual(['live'])
    expect(ranking().getByRole('radio', { name: 'Live' })).toBeChecked()
    live.unmount()

    modes.length = 0
    openSquad(first, '?mode=fast')
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })
    expect(modes).toEqual(['full-game'])
  })

  it('can go back to the steady mode from live (RES-45)', async () => {
    const user = userEvent.setup()
    const { modes, first } = serveSquad(fourGames)
    openSquad(first, '?mode=live')
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    await user.click(ranking().getByRole('radio', { name: /Through/ }))

    await waitFor(() => {
      expect(modes.at(-1)).toBe('full-game')
    })
    expect(await screen.findByRole('radio', { name: 'Through game 3' })).toBeChecked()
  })
})

describe('Results tab games not counted yet (RES-46, D-239)', () => {
  it('dims a game that is not full and leaves it out of the figures, with a legend (RES-46)', async () => {
    const { first } = serveSquad(fourGames)
    openSquad(first)
    const table = within(
      await screen.findByRole(
        'table',
        { name: 'Results for the Open division' },
        { timeout: 3000 },
      ),
    )

    const dana = table.getByRole('row', { name: /Dana Whitcomb/ })
    // The fourth game shows, read as "Not counted yet: 300", and the total is of three games.
    expect(within(dana).getByText('Not counted yet:')).toBeInTheDocument()
    expect(dana).toHaveTextContent('300')
    expect(dana).toHaveTextContent('630')
    expect(dana).not.toHaveTextContent('930')
    expect(
      screen.getByText(/Game 4 is not full yet\. These scores show, but places and totals/),
    ).toBeVisible()
    expect(screen.getByText('Ranked through game 3. Game 4 has 1 of 2 scores.')).toBeVisible()
    // Mike has no fourth game: a plain dash, not a dimmed score.
    expect(within(table.getByRole('row', { name: /Mike Orsini/ })).queryByText(/Not counted/)).toBe(
      null,
    )
  })

  it('dims nothing and has no legend in live mode (RES-46)', async () => {
    const { first } = serveSquad(fourGames)
    openSquad(first, '?mode=live')
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    expect(screen.queryByText(/Not counted yet/)).not.toBeInTheDocument()
    expect(screen.queryByText(/is not full yet/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ranked through game/)).not.toBeInTheDocument()
  })

  it('says only the games counted when no one is ahead (RES-46)', async () => {
    const even = (mode: RankMode) =>
      createSquadResults({
        session: { ...createSquadResults().session, id: sessionId },
        mode,
        divisions: [
          createDivisionResult({
            name: 'Open',
            entries: 1,
            throughGame: 2,
            rows: [
              createSquadRow({ name: 'Dana Whitcomb', scores: [200, 200], total: 400, games: 2 }),
            ],
          }),
        ],
      })
    const { first } = serveSquad(even)
    openSquad(first)
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    expect(screen.getByText('Ranked through game 2.')).toBeVisible()
    expect(screen.queryByText(/is not full yet/)).not.toBeInTheDocument()
  })

  it('takes the handicap totals from the counted games only (RES-46, RES-11a)', async () => {
    const handicap = (mode: RankMode) =>
      createSquadResults({
        session: { ...createSquadResults().session, id: sessionId, games: 3 },
        mode,
        divisions: [
          createDivisionResult({
            name: 'Open',
            entries: 1,
            showHandicap: true,
            throughGame: 2,
            // Two counted games of 200 with 10 a game: 420. A third game of 250 is not counted.
            rows: [
              createSquadRow({
                name: 'Dana Whitcomb',
                scores: [200, 200, 250],
                total: 420,
                games: 2,
                handicap: 10,
              }),
            ],
          }),
        ],
      })
    const { first } = serveSquad(handicap)
    openSquad(first)
    const table = within(
      await screen.findByRole(
        'table',
        { name: 'Results for the Open division' },
        { timeout: 3000 },
      ),
    )

    const cells = Array.from(table.getByRole('row', { name: /Dana/ }).children).map(
      (cell) => cell.textContent,
    )
    // Scratch Total 400, Total HDCP 20, HDCP Total 420: the third game is not in them.
    expect(cells.slice(-3)).toEqual(['400', '20', '420'])
  })

  it('shows a phone card with the same dimmed game (RES-46, WB-5)', async () => {
    const { first } = serveSquad(fourGames)
    openSquad(first)
    const table = within(
      await screen.findByRole(
        'table',
        { name: 'Results for the Open division' },
        { timeout: 3000 },
      ),
    )
    const cell = within(table.getByRole('row', { name: /Dana Whitcomb/ })).getByText('300')
    // The cell carries its label, which the card layout shows beside the figure.
    expect(cell.closest('td')).toHaveAttribute('data-label', 'G4')
  })
})

describe('Results tab DNF tag (RES-56, D-251)', () => {
  it('tags a flagged bowler by the name and no one else', async () => {
    const flagged = (mode: RankMode) =>
      createSquadResults({
        session: { ...createSquadResults().session, id: sessionId },
        mode,
        divisions: [
          createDivisionResult({
            name: 'Open',
            entries: 2,
            rows: [
              createSquadRow({
                name: 'Walt Pruitt',
                place: 1,
                dnf: true,
                scores: [250, 250],
                games: 2,
              }),
              createSquadRow({ name: 'Dana Whitcomb', place: 2 }),
            ],
          }),
        ],
      })
    const { first } = serveSquad(flagged)
    openSquad(first)
    const table = within(
      await screen.findByRole(
        'table',
        { name: 'Results for the Open division' },
        { timeout: 3000 },
      ),
    )

    expect(within(table.getByRole('row', { name: /Walt Pruitt/ })).getByText('DNF')).toBeVisible()
    expect(within(table.getByRole('row', { name: /Dana Whitcomb/ })).queryByText('DNF')).toBe(null)
  })
})

describe('Results tab follows its stream (RES-44, D-241)', () => {
  it('opens the public stream of an open squad and asks again on a message', async () => {
    const results = fourGames('full-game')
    let calls = 0
    const { first } = serveSquad(fourGames)
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', () => {
        calls += 1
        return HttpResponse.json(
          calls === 1
            ? results
            : {
                ...results,
                divisions: [
                  {
                    ...(results.divisions[0] ?? createDivisionResult()),
                    rows: [createSquadRow({ name: 'Walt Pruitt', place: 1 })],
                  },
                ],
              },
        )
      }),
    )
    openSquad(first)
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    const stream = FakeEventSource.latest()
    expect(stream.url).toContain(`/squads/${sessionId}/scores/events`)
    act(() => {
      stream.open()
      stream.message('{"kind":"scores","version":1}')
    })

    expect(await screen.findByText('Walt Pruitt')).toBeVisible()
    expect(calls).toBe(2)
  })

  it('refreshes both modes: the cached answer of the other mode is not left old (RES-44)', async () => {
    const user = userEvent.setup()
    let version = 0
    const { first } = serveSquad(fourGames)
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', ({ request }) => {
        const live = new URL(request.url).searchParams.get('mode') === 'live'
        const base = fourGames(live ? 'live' : 'full-game')
        const division = base.divisions[0] ?? createDivisionResult()
        return HttpResponse.json({
          ...base,
          divisions: [{ ...division, name: `Open v${version}` }],
        })
      }),
    )
    openSquad(first)
    await screen.findByRole(
      'table',
      { name: 'Results for the Open division'.replace('Open', 'Open v0') },
      { timeout: 3000 },
    )
    await user.click(ranking().getByRole('radio', { name: 'Live' }))
    await screen.findByRole('table', { name: 'Results for the Open v0 division' })

    version = 1
    act(() => {
      FakeEventSource.latest().open()
      FakeEventSource.latest().message()
    })
    await screen.findByRole('table', { name: 'Results for the Open v1 division' })
    await user.click(ranking().getByRole('radio', { name: /Through/ }))

    // The steady answer was asked again too, so it is version 1, not the old version 0.
    expect(
      await screen.findByRole('table', { name: 'Results for the Open v1 division' }),
    ).toBeVisible()
  })

  it('opens no stream for a complete squad (D-10)', async () => {
    const done = (mode: RankMode) =>
      createSquadResults({
        session: { ...createSquadResults().session, id: sessionId, complete: true },
        mode,
        divisions: [createDivisionResult({ name: 'Open', entries: 1, rows: [createSquadRow()] })],
      })
    const { first } = serveSquad(done)
    openSquad(first)
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    expect(FakeEventSource.instances).toHaveLength(0)
    expect(screen.queryByRole('status', { name: /Live/ })).not.toBeInTheDocument()
  })

  it('shows the live status line while the squad is open (RES-44)', async () => {
    const { first } = serveSquad(fourGames)
    openSquad(first)
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    act(() => {
      FakeEventSource.latest().open()
    })

    expect(await screen.findByText(/Live: changes by others show here/)).toBeVisible()
  })

  it('keeps the last results when the refetch after a message fails (RES-44)', async () => {
    const { first } = serveSquad(fourGames)
    openSquad(first)
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })
    let asked = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', () => {
        asked += 1
        return new HttpResponse(null, { status: 503 })
      }),
    )

    act(() => {
      FakeEventSource.latest().open()
      FakeEventSource.latest().message()
    })

    await waitFor(() => {
      expect(asked).toBeGreaterThan(0)
    })
    expect(screen.getByRole('table', { name: 'Results for the Open division' })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('sweeper and super sweeper pages (RES-41, RES-42, D-252)', () => {
  function sweeperAnswer(mode: RankMode): SweeperResults {
    return createSweeperResults({
      session: { ...createSweeperResults().session, id: sessionId, games: 3 },
      mode,
      throughGame: mode === 'live' ? null : 2,
      entries: 2,
      cashers: 1,
      cutScore: 400,
      rows: [
        createSweeperRow({
          name: 'Walt Pruitt',
          place: 1,
          group: 'casher',
          total: 400,
          games: 2,
          scores: [200, 200, 250],
          dnf: true,
        }),
        createSweeperRow({
          name: 'Dana Whitcomb',
          place: 2,
          total: 380,
          games: 2,
          scores: [190, 190, null],
        }),
      ],
    })
  }

  function serveSweeper() {
    const modes: string[] = []
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/sweepers', () =>
        HttpResponse.json({ sweepers: [createSweeper({ id: sessionId })] }),
      ),
      http.get('/v1/tournaments/:id/sweepers/:sessionId/results', ({ request }) => {
        const mode = new URL(request.url).searchParams.get('mode') ?? ''
        modes.push(mode)
        return HttpResponse.json(sweeperAnswer(mode === 'live' ? 'live' : 'full-game'))
      }),
    )
    return modes
  }

  it('shows the toggle, dims the game not counted, and tags a flagged bowler on a sweeper', async () => {
    const user = userEvent.setup()
    const modes = serveSweeper()
    renderApp(`/tournaments/${tournament.id}/sweepers/${sessionId}/results`)
    const table = within(
      await screen.findByRole('table', { name: 'Sweeper results' }, { timeout: 3000 }),
    )

    expect(ranking().getByRole('radio', { name: 'Through game 2' })).toBeChecked()
    expect(within(table.getByRole('row', { name: /Walt Pruitt/ })).getByText('DNF')).toBeVisible()
    expect(
      within(table.getByRole('row', { name: /Walt Pruitt/ })).getByText('Not counted yet:'),
    ).toBeVisible()
    expect(screen.getByText('Ranked through game 2. Game 3 has 1 of 2 scores.')).toBeVisible()

    await user.click(ranking().getByRole('radio', { name: 'Live' }))
    await waitFor(() => {
      expect(modes).toContain('live')
    })
  })

  it('follows the stream of an open sweeper (RES-44)', async () => {
    serveSweeper()
    renderApp(`/tournaments/${tournament.id}/sweepers/${sessionId}/results`)
    await screen.findByRole('table', { name: 'Sweeper results' }, { timeout: 3000 })

    expect(FakeEventSource.latest().url).toContain(`/sweepers/${sessionId}/scores/events`)
  })

  function superAnswer(mode: RankMode): SuperSweeperResults {
    return createSuperSweeperResults({
      mode,
      entries: 1,
      cashers: 1,
      cutScore: 1200,
      rows: [
        createSuperSweeperRow({ name: 'Dana Whitcomb', place: 1, group: 'casher', dnf: true }),
      ],
    })
  }

  it('gives the super sweeper the same toggle and asks for the mode (RES-42, D-252)', async () => {
    const user = userEvent.setup()
    const modes: string[] = []
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/super-sweeper', ({ request }) => {
        const mode = new URL(request.url).searchParams.get('mode') ?? ''
        modes.push(mode)
        return HttpResponse.json(superAnswer(mode === 'live' ? 'live' : 'full-game'))
      }),
    )
    renderApp(`/tournaments/${tournament.id}/super-sweeper`)
    const table = within(
      await screen.findByRole('table', { name: 'Super sweeper results' }, { timeout: 3000 }),
    )

    expect(modes).toEqual(['full-game'])
    expect(ranking().getByRole('radio', { name: 'Through the last full game' })).toBeChecked()
    expect(table.getByText('DNF')).toBeVisible()

    await user.click(ranking().getByRole('radio', { name: 'Live' }))

    await waitFor(() => {
      expect(modes).toContain('live')
    })
  })
})
