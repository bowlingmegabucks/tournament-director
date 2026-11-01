import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createScoreBowler,
  createSignedInUser,
  createScorePage,
  createScorePair,
  createSquad,
  createSweeper,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { ScorePage } from './types'
import { SCORE_REFRESH_MS } from './useScores'

const tournament = createTournament({ name: 'Spring Open' })

/** Serve the Scores page for the squad or sweeper it describes, with a matching session list for the header. */
function serve(page: ScorePage) {
  const { session } = page
  const head = { id: session.id, date: session.date, complete: session.complete }
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/squads', () =>
      HttpResponse.json({ squads: session.kind === 'squad' ? [createSquad(head)] : [] }),
    ),
    http.get('/v1/tournaments/:id/sweepers', () =>
      HttpResponse.json({ sweepers: session.kind === 'sweeper' ? [createSweeper(head)] : [] }),
    ),
    http.get('/v1/tournaments/:id/squads/:sessionId/scores', () => HttpResponse.json(page)),
    http.get('/v1/tournaments/:id/sweepers/:sessionId/scores', () => HttpResponse.json(page)),
  )
}

const open = (page: ScorePage) =>
  renderApp(`/tournaments/${tournament.id}/${page.session.kind}s/${page.session.id}/scores`)

const joe = createScoreBowler({
  name: 'Joe Fontaine',
  divisionName: 'Open',
  position: '1A',
  scores: [212, 198, 231],
})
const maria = createScoreBowler({
  name: 'Maria Costa',
  divisionName: 'Women',
  position: '1B',
  scores: [187, 204, null],
})
const priya = createScoreBowler({ name: 'Priya Nair', position: '2C', scores: [null, null, null] })
const tom = createScoreBowler({ name: 'Tom Brandt', position: '3A', scores: [176, 190, 201] })

function filled(overrides: Partial<ScorePage> = {}): ScorePage {
  return createScorePage({
    pairs: [createScorePair(1, [joe, maria, priya]), createScorePair(3, [tom])],
    ...overrides,
  })
}

const tableFor = async (name: string) =>
  within(await screen.findByRole('table', { name }, { timeout: 3000 }))

afterEach(() => {
  vi.useRealTimers()
})

describe('ScoresPage', () => {
  it('shows one table per lane pair, with the bowlers lane by lane (SCR-13, SCR-17)', async () => {
    const page = filled()
    serve(page)

    open(page)

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Lanes 1-2' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Lanes 3-4' })).toBeVisible()
    const first = await tableFor('Scores for lanes 1-2')
    expect(first.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
      'Joe FontaineOpen',
      'Maria CostaWomen',
      'Priya NairOpen',
    ])
    expect(first.getAllByRole('cell')[0]).toHaveTextContent('1A')
    const second = await tableFor('Scores for lanes 3-4')
    expect(second.getAllByRole('rowheader')).toHaveLength(1)
  })

  it('shows each game score and the scratch total (D-68, D-69)', async () => {
    const page = filled()
    serve(page)

    open(page)

    const table = await tableFor('Scores for lanes 1-2')
    const joeRow = table.getByRole('row', { name: /Joe Fontaine/ })
    expect(
      within(joeRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['1A', '212', '198', '231', '641'])
    expect(table.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Lane',
      'Bowler',
      'G1Game 1',
      'G2Game 2',
      'G3Game 3',
      'Total',
    ])
  })

  it('labels each cell for the narrow layout, which shows the label above the number (D-73)', async () => {
    const page = filled()
    serve(page)

    open(page)

    const table = await tableFor('Scores for lanes 1-2')
    const joeRow = table.getByRole('row', { name: /Joe Fontaine/ })
    expect(
      within(joeRow)
        .getAllByRole('cell')
        .map((cell) => cell.getAttribute('data-label')),
    ).toEqual([null, 'G1', 'G2', 'G3', 'Total'])
  })

  it('leaves a game with no score blank for a screen reader to read as "no score" (D-69)', async () => {
    const page = filled()
    serve(page)

    open(page)

    const table = await tableFor('Scores for lanes 1-2')
    const mariaRow = table.getByRole('row', { name: /Maria Costa/ })
    expect(within(mariaRow).getAllByText('no score')).toHaveLength(1)
    expect(
      within(mariaRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['1B', '187', '204', 'no score', '391'])
    const priyaRow = table.getByRole('row', { name: /Priya Nair/ })
    expect(within(priyaRow).getAllByText('no score')).toHaveLength(3)
    expect(within(priyaRow).getAllByRole('cell').at(-1)).toHaveTextContent('0')
  })

  it('shows a stored 0 as "0", not as a blank (D-69, SQD-15)', async () => {
    const noShow = createScoreBowler({ name: 'Carl Weber', position: '1A', scores: [0, 0, 0] })
    const page = createScorePage({ pairs: [createScorePair(1, [noShow])] })
    serve(page)

    open(page)

    const row = (await tableFor('Scores for lanes 1-2')).getByRole('row', { name: /Carl Weber/ })
    expect(within(row).queryByText('no score')).not.toBeInTheDocument()
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['1A', '0', '0', '0', '0'])
  })

  it('draws a column for every game, including one past the squad count (D-69)', async () => {
    const long = createScoreBowler({
      name: 'Ann Lee',
      position: '1A',
      scores: [100, 110, 120, 130],
    })
    const page = createScorePage({
      session: { ...createScorePage().session, games: 4 },
      pairs: [createScorePair(1, [long])],
    })
    serve(page)

    open(page)

    const table = await tableFor('Scores for lanes 1-2')
    expect(table.getByRole('columnheader', { name: /Game 4/ })).toBeVisible()
    expect(table.getByRole('row', { name: /Ann Lee/ })).toHaveTextContent('460')
  })

  it('says a complete squad cannot change, and has no controls that change a score (SCR-14, SQD-17)', async () => {
    const page = filled({ session: { ...createScorePage().session, complete: true } })
    serve(page)

    open(page)

    expect(
      await screen.findByText(
        'This squad is complete. Scores cannot change.',
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('has no entry controls on an open squad either (D-69)', async () => {
    const page = filled()
    serve(page)

    open(page)

    await screen.findByRole('table', { name: 'Scores for lanes 1-2' }, { timeout: 3000 })
    expect(screen.queryByText(/complete/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('says a complete sweeper cannot change (SCR-14)', async () => {
    const page = filled({
      session: { ...createScorePage().session, kind: 'sweeper', complete: true },
    })
    serve(page)

    open(page)

    expect(
      await screen.findByText(
        'This sweeper is complete. Scores cannot change.',
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible()
  })

  it('notes the bowlers with no lane, with a link to assign them for a user who may see lanes (D-71, D-52)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const page = filled({ noLane: 3 })
    serve(page)

    open(page)

    expect(await screen.findByText(/3 bowlers have no lane\./, {}, { timeout: 3000 })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Assign lanes' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/squads/${page.session.id}/lanes`,
    )
  })

  it('notes the bowlers with no lane but offers no link to a visitor who is signed out (D-52)', async () => {
    const page = filled({ noLane: 3 })
    serve(page)

    open(page)

    expect(await screen.findByText(/3 bowlers have no lane\./, {}, { timeout: 3000 })).toBeVisible()
    // The lane page needs sign-in, so the link would lead to a sign-in page.
    expect(screen.queryByRole('link', { name: 'Assign lanes' })).not.toBeInTheDocument()
  })

  it('says one bowler in the singular and shows no note for none (D-71)', async () => {
    const page = filled({ noLane: 1 })
    serve(page)

    open(page)

    expect(await screen.findByText(/1 bowler has no lane\./, {}, { timeout: 3000 })).toBeVisible()
  })

  it('shows no no-lane note when everyone has a lane (D-71)', async () => {
    const page = filled()
    serve(page)

    open(page)

    await screen.findByRole('table', { name: 'Scores for lanes 1-2' }, { timeout: 3000 })
    expect(screen.queryByText(/no lane/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Assign lanes' })).not.toBeInTheDocument()
  })

  it('lists other positions with the raw position and the scores (D-61, D-71)', async () => {
    const lost = createScoreBowler({ name: 'Ray Dunn', position: '99A', scores: [150, 161, 170] })
    const page = filled({ other: [lost] })
    serve(page)

    open(page)

    expect(
      await screen.findByRole(
        'heading',
        { level: 2, name: 'Other positions (1)' },
        { timeout: 3000 },
      ),
    ).toBeVisible()
    const table = await tableFor('Scores for other positions')
    const row = table.getByRole('row', { name: /Ray Dunn/ })
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['99A', '150', '161', '170', '481'])
  })

  it('shows no other-positions section when there are none', async () => {
    const page = filled()
    serve(page)

    open(page)

    await screen.findByRole('table', { name: 'Scores for lanes 1-2' }, { timeout: 3000 })
    expect(screen.queryByRole('heading', { name: /Other positions/ })).not.toBeInTheDocument()
  })

  it('says nobody has entered a squad that has no bowlers (SCR-17)', async () => {
    const page = createScorePage()
    serve(page)

    open(page)

    expect(
      await screen.findByText('No bowlers have entered this squad yet.', {}, { timeout: 3000 }),
    ).toBeVisible()
  })

  it('says a sweeper has no bowlers in the sweeper words (SCR-17)', async () => {
    const page = createScorePage({ session: { ...createScorePage().session, kind: 'sweeper' } })
    serve(page)

    open(page)

    expect(
      await screen.findByText('No bowlers have entered this sweeper yet.', {}, { timeout: 3000 }),
    ).toBeVisible()
  })

  it('says to assign lanes when everyone is still without one (D-71)', async () => {
    const page = createScorePage({ noLane: 5 })
    serve(page)

    open(page)

    expect(
      await screen.findByText('No one has a lane yet. Assign lanes first.', {}, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByText(/5 bowlers have no lane\./)).toBeVisible()
    expect(screen.queryByText(/No bowlers have entered/)).not.toBeInTheDocument()
  })

  it('names the page, the session, and the tournament in the title (SCR-17)', async () => {
    const page = filled()
    serve(page)

    open(page)

    await screen.findByRole('table', { name: 'Scores for lanes 1-2' }, { timeout: 3000 })
    await waitFor(() => {
      expect(document.title).toBe(
        'Scores · Sat 10/24/2026 9:00 AM · Spring Open · Tournament Director',
      )
    })
  })

  it('shows the loading state, then the page', async () => {
    const page = filled()
    serve(page)

    open(page)

    expect(await screen.findByText('Loading scores…', {}, { timeout: 3000 })).toBeInTheDocument()
    await screen.findByRole('table', { name: 'Scores for lanes 1-2' }, { timeout: 3000 })
    expect(screen.queryByText('Loading scores…')).not.toBeInTheDocument()
  })

  it('shows an error and recovers on Try again (SCR-17)', async () => {
    const page = filled()
    serve(page)
    let fail = true
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/scores', () =>
        fail ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(page),
      ),
    )

    open(page)

    expect(
      await screen.findByText('Failed to load scores (503)', {}, { timeout: 3000 }),
    ).toBeVisible()
    fail = false
    screen.getByRole('button', { name: 'Try again' }).click()
    await screen.findByRole('table', { name: 'Scores for lanes 1-2' }, { timeout: 3000 })
  })

  it('shows an error for a body that is not a scores page', async () => {
    const page = filled()
    serve(page)
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/scores', () => HttpResponse.json({})),
    )

    open(page)

    expect(
      await screen.findByText('Failed to load scores (unexpected response)', {}, { timeout: 3000 }),
    ).toBeVisible()
  })
})

describe('ScoresPage refresh (SCR-18, D-72)', () => {
  it('asks again every 15 seconds and shows a changed score', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const page = filled()
    serve(page)
    open(page)
    await screen.findByRole('table', { name: 'Scores for lanes 1-2' }, { timeout: 3000 })
    expect(screen.queryByText('200')).not.toBeInTheDocument()
    const changed = filled({
      pairs: [
        createScorePair(1, [{ ...priya, scores: [200, null, null], total: 200 }, joe, maria]),
        createScorePair(3, [tom]),
      ],
    })
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/scores', () => HttpResponse.json(changed)),
    )

    await vi.advanceTimersByTimeAsync(SCORE_REFRESH_MS + 100)

    await waitFor(() => {
      expect(screen.getAllByText('200').length).toBeGreaterThan(0)
    })
  })

  it('stops asking once the session is complete (SCR-18, D-10)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const page = filled({ session: { ...createScorePage().session, complete: true } })
    serve(page)
    let asked = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/scores', () => {
        asked += 1
        return HttpResponse.json(page)
      }),
    )
    open(page)
    await screen.findByRole('table', { name: 'Scores for lanes 1-2' }, { timeout: 3000 })
    expect(asked).toBe(1)

    await vi.advanceTimersByTimeAsync(SCORE_REFRESH_MS * 3)

    expect(asked).toBe(1)
  })

  it('keeps the last scores on screen when a refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const page = filled()
    serve(page)
    open(page)
    await screen.findByRole('table', { name: 'Scores for lanes 1-2' }, { timeout: 3000 })
    let asked = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/scores', () => {
        asked += 1
        return new HttpResponse(null, { status: 503 })
      }),
    )

    await vi.advanceTimersByTimeAsync(SCORE_REFRESH_MS + 100)

    await waitFor(() => {
      expect(asked).toBeGreaterThan(0)
    })
    expect(screen.getByRole('table', { name: 'Scores for lanes 1-2' })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
