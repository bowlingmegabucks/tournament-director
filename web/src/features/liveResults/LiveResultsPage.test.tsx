import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../mocks/server'
import {
  createDivisionResult,
  createLiveResults,
  createSquadResults,
  createSquadRow,
  createSuperSweeperResults,
  createSuperSweeperRow,
  createSweeperResults,
  createSweeperRow,
  createTournament,
} from '../../mocks/data'
import { FakeEventSource } from '../../test/fakeEventSource'
import { renderApp } from '../../test/renderApp'
import type { DivisionResult, LiveResults } from '../results/types'
import { NOTICE_MS } from './useNotices'
import { HIGHLIGHT_MS, LIVE_REFRESH_MS } from './useLiveResults'

const tournament = createTournament({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Spring Open',
})
const squadId = '22222222-2222-4222-8222-222222222222'
const sweeperId = '33333333-3333-4333-8333-333333333333'
const openId = '44444444-4444-4444-8444-444444444444'
const seniorId = '55555555-5555-4555-8555-555555555555'

const realMatchMedia = globalThis.matchMedia

afterEach(() => {
  vi.useRealTimers()
  // Put back only what a test replaced: `unstubAllGlobals` would also drop the fake event stream.
  if (realMatchMedia) vi.stubGlobal('matchMedia', realMatchMedia)
  else Reflect.deleteProperty(globalThis, 'matchMedia')
})

const openDivision = (over: Partial<DivisionResult> = {}) =>
  createDivisionResult({
    id: openId,
    name: 'Open',
    entries: 2,
    throughGame: 2,
    rows: [
      createSquadRow({ name: 'Dana Whitcomb', place: 1, scores: [200, 210], total: 410, games: 2 }),
      createSquadRow({ name: 'Mike Orsini', place: 2, scores: [190, 200], total: 390, games: 2 }),
    ],
    ...over,
  })

function feedOf(over: Partial<LiveResults> = {}): LiveResults {
  return createLiveResults({
    tournament: { id: tournament.id, name: 'Spring Open' },
    sessions: [
      {
        kind: 'squad',
        results: createSquadResults({
          session: { ...createSquadResults().session, id: squadId, date: '2026-10-24T09:00:00' },
          divisions: [
            openDivision(),
            createDivisionResult({
              id: seniorId,
              name: 'Senior',
              entries: 1,
              throughGame: 2,
              rows: [
                createSquadRow({
                  name: 'Walt Henning',
                  place: 1,
                  scores: [220, 230],
                  total: 450,
                  games: 2,
                }),
              ],
            }),
          ],
        }),
      },
      {
        kind: 'sweeper',
        results: createSweeperResults({
          session: {
            ...createSweeperResults().session,
            id: sweeperId,
            date: '2026-10-24T18:00:00',
            games: 3,
          },
          throughGame: 1,
          entries: 1,
          cashers: 1,
          cutScore: 230,
          rows: [
            createSweeperRow({
              name: 'Tom Garrity',
              place: 1,
              group: 'casher',
              total: 230,
              games: 1,
              scores: [230, null, null],
            }),
          ],
        }),
      },
    ],
    superSweeper: createSuperSweeperResults({
      entries: 1,
      cashers: 1,
      cutScore: 1200,
      rows: [createSuperSweeperRow({ name: 'Rita Maddox', place: 1, group: 'casher' })],
    }),
    ...over,
  })
}

/** Serve the feed and the division route; `calls` counts what the page asked. */
function serve(feed: LiveResults = feedOf()) {
  const calls = { feed: 0, division: [] as string[] }
  let current = feed
  server.use(
    http.get('/v1/tournaments/:id/live-results', () => {
      calls.feed += 1
      return HttpResponse.json(current)
    }),
    http.get('/v1/tournaments/:id/squads/:sessionId/results', ({ request }) => {
      calls.division.push(new URL(request.url).search)
      const division = openDivision({
        throughGame: 3,
        rows: [
          createSquadRow({
            name: 'Dana Whitcomb',
            place: 1,
            scores: [200, 210, 220],
            total: 630,
            games: 3,
          }),
        ],
      })
      return HttpResponse.json(
        createSquadResults({
          session: { ...createSquadResults().session, id: squadId },
          divisions: [division],
        }),
      )
    }),
  )
  return { calls, set: (next: LiveResults) => (current = next) }
}

const open_ = () => renderApp(`/tournaments/${tournament.id}/liveResults`)

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('LiveResultsPage (RES-50, D-242)', () => {
  it('shows every squad division, the sweeper, and the super sweeper, with one h1', async () => {
    serve()
    open_()

    expect(
      await screen.findByRole('heading', { level: 1, name: /Live results · Spring Open/ }),
    ).toBeVisible()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    expect(screen.getByRole('table', { name: 'Results for the Senior division' })).toBeVisible()
    expect(screen.getByRole('table', { name: 'Sweeper results' })).toBeVisible()
    expect(screen.getByRole('table', { name: 'Super sweeper results' })).toBeVisible()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('names each screen and tags the unofficial ones with the games counted (D-84, D-239)', async () => {
    serve()
    open_()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    const first = screen.getAllByRole('heading', { level: 2 })[0]
    expect(first).toHaveTextContent('Squad · Sat 10/24/2026 9:00 AM · Open')
    expect(first).toHaveTextContent('Unofficial')
    expect(first).toHaveTextContent('Through game 2')
    expect(headings().some((text) => text?.startsWith('Super sweeper'))).toBe(true)
  })

  it('shows no unofficial tag for a complete session (D-84)', async () => {
    const feed = feedOf()
    const squad = feed.sessions[0]
    if (squad?.kind !== 'squad') throw new Error('fixture')
    squad.results.session.complete = true
    serve(feed)
    open_()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    expect(screen.getAllByRole('heading', { level: 2 })[0]).not.toHaveTextContent('Unofficial')
  })

  it('has no header, main menu, or tournament sidebar: the page is the screen (D-242)', async () => {
    serve()
    open_()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('needs no sign-in', async () => {
    serve()
    open_()
    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })
    expect(screen.queryByText(/Sign in/)).not.toBeInTheDocument()
  })

  it('sets the page title', async () => {
    serve()
    open_()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })
    await waitFor(() => {
      expect(document.title).toBe('Live results · Spring Open · Tournament Director')
    })
  })

  it('says when the board last updated on the strip, with nothing else waiting (D-245)', async () => {
    serve()
    open_()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    expect(screen.getAllByRole('status')[0]).toHaveTextContent(/^Updated \d{1,2}:\d{2} (am|pm)$/)
  })
})

describe('LiveResultsPage pinned heading (D-254)', () => {
  it('puts the counts and the totals at the cut and cash lines in the heading block of each screen', async () => {
    const feed = feedOf()
    const squad = feed.sessions[0]
    if (squad?.kind !== 'squad') throw new Error('fixture')
    const open = squad.results.divisions[0]
    if (!open) throw new Error('fixture')
    open.rows = [
      createSquadRow({ name: 'Dana Whitcomb', place: 1, group: 'advancer', total: 827 }),
      createSquadRow({ name: 'Mike Orsini', place: 2, group: 'casher', total: 809 }),
      createSquadRow({ name: 'Lou Brandt', place: 3, group: 'other', total: 700 }),
    ]
    serve(feed)
    open_()

    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    const heading = screen.getAllByRole('heading', { level: 2 })[0]
    const block = heading?.closest('div')
    expect(block).toHaveTextContent('Cut line +227 · Cash line +209')
    expect(block).toHaveTextContent('Ranked through game 2.')
    // The table below holds the rows, not the lines.
    expect(block?.querySelector('table')).toBeNull()
  })

  it('gives a sweeper and the super sweeper their cash line', async () => {
    serve()
    open_()
    await screen.findByRole('table', { name: 'Sweeper results' }, { timeout: 3000 })

    const sweeper = screen
      .getAllByRole('heading', { level: 2 })
      .find((heading) => heading.textContent?.startsWith('Sweeper'))
    expect(sweeper?.closest('div')).toHaveTextContent('Cash line +30')
    const superSweeper = screen
      .getAllByRole('heading', { level: 2 })
      .find((heading) => heading.textContent?.startsWith('Super sweeper'))
    expect(superSweeper?.closest('div')).toHaveTextContent('Cash line EVEN')
  })
})

describe('LiveResultsPage states (RES-50, D-246)', () => {
  it('shows loading, then the results', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('/v1/tournaments/:id/live-results', async () => {
        await gate
        return HttpResponse.json(feedOf())
      }),
    )
    open_()

    expect(await screen.findByText('Loading results…', {}, { timeout: 3000 })).toBeVisible()
    release()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })
  })

  it('says "No scores entered yet." and that the page updates on its own', async () => {
    serve(createLiveResults({ tournament: { id: tournament.id, name: 'Spring Open' } }))
    open_()

    expect(await screen.findByText('No scores entered yet.', {}, { timeout: 3000 })).toBeVisible()
    expect(screen.getByText(/It updates on its own/)).toBeVisible()
  })

  it('shows an alert with no button when the first load fails, and tries again in a minute (RES-52)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let asked = 0
    server.use(
      http.get('/v1/tournaments/:id/live-results', () => {
        asked += 1
        // The first try and its one retry fail; the minute's refresh works.
        return asked <= 2 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(feedOf())
      }),
    )
    open_()

    expect(await screen.findByRole('alert', {}, { timeout: 8000 })).toHaveTextContent(
      'Could not load results.',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('The page tries again every minute.')).toBeVisible()

    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS + 100)

    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })
  })

  it('shows an alert for a tournament that is not there', async () => {
    server.use(
      http.get('/v1/tournaments/:id/live-results', () => new HttpResponse(null, { status: 404 })),
    )
    open_()
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toBeVisible()
  })
})

describe('LiveResultsPage follows the stream (RES-49, RES-50, D-243 to D-245)', () => {
  const message = (kind: string, detail: object) => JSON.stringify({ kind, detail, version: 1 })

  async function ready(feed = feedOf()) {
    const served = serve(feed)
    open_()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })
    act(() => {
      FakeEventSource.latest().open()
    })
    return served
  }

  it('opens the public tournament stream', async () => {
    await ready()
    expect(FakeEventSource.latest().url).toContain(
      `/tournaments/${tournament.id}/live-results/events`,
    )
  })

  it('has no banner under the bar: the update time sits in the bar, the notice is for a screen reader (D-255)', async () => {
    await ready()
    act(() => {
      FakeEventSource.latest().message(
        message('game-full', {
          sessionId: squadId,
          sessionKind: 'squad',
          divisionId: openId,
          game: 1,
        }),
      )
    })

    expect(await screen.findByText('Open Division – Game 1 complete')).toBeInTheDocument()
    // The words are in a status with nothing on screen; the bar holds the time.
    expect(screen.getByText('Open Division – Game 1 complete').className).toMatch(/hidden/)
    expect(
      within(screen.getByRole('banner')).getByText(/^Updated \d{1,2}:\d{2} (am|pm)$/),
    ).toBeVisible()
  })

  it('draws a lower third for a game before the last, and the flash for the last (D-255)', async () => {
    await ready()
    const send = (game: number) => {
      act(() => {
        FakeEventSource.latest().message(
          message('game-full', {
            sessionId: squadId,
            sessionKind: 'squad',
            divisionId: openId,
            game,
          }),
        )
      })
    }

    send(1)
    expect(await screen.findByText('Game 1 complete')).toBeInTheDocument()
    expect(screen.queryByText('Final game complete')).not.toBeInTheDocument()
    // The overlay is for the eye: the strip carries the words for a screen reader.
    expect(screen.getByText('Game 1 complete').closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('draws the official mark when the squad completes (D-255)', async () => {
    await ready()

    act(() => {
      FakeEventSource.latest().message(
        message('complete', { sessionId: squadId, sessionKind: 'squad' }),
      )
    })

    expect(await screen.findByText('Results are official')).toBeInTheDocument()
    // The words for a screen reader stay in a status line.
    expect(screen.getByText('Session complete – results are official')).toBeInTheDocument()
  })

  it('draws the flash for the last game of the squad, which has 3 games (D-255)', async () => {
    await ready()

    act(() => {
      FakeEventSource.latest().message(
        message('game-full', {
          sessionId: squadId,
          sessionKind: 'squad',
          divisionId: openId,
          game: 3,
        }),
      )
    })

    expect(await screen.findByText('Final game complete')).toBeInTheDocument()
  })

  it('shows how many more are waiting when games finish together (D-255)', async () => {
    await ready()

    act(() => {
      for (const game of [1, 2, 3]) {
        FakeEventSource.latest().message(
          message('game-full', {
            sessionId: squadId,
            sessionKind: 'squad',
            divisionId: openId,
            game,
          }),
        )
      }
    })

    expect(await screen.findByText('+2 more waiting')).toBeInTheDocument()
  })

  it('posts the game on the strip and loads only the division that changed', async () => {
    const { calls } = await ready()

    act(() => {
      FakeEventSource.latest().message(
        message('game-full', {
          sessionId: squadId,
          sessionKind: 'squad',
          divisionId: openId,
          game: 3,
        }),
      )
    })

    expect(await screen.findByText('Open Division – Game 3 complete')).toBeVisible()
    await waitFor(() => {
      expect(calls.division).toEqual([`?mode=full-game&division=${openId}`])
    })
    // The Open table now has game 3; the Senior table is the one it was.
    const open3 = within(
      await screen.findByRole('table', { name: 'Results for the Open division' }),
    )
    await waitFor(() => {
      expect(open3.getByText('630')).toBeVisible()
    })
    expect(screen.getByRole('table', { name: 'Results for the Senior division' })).toBeVisible()
    expect(calls.feed).toBe(1)
  })

  it('outlines the table that changed for a few seconds, then lets go (D-245)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await ready()
    act(() => {
      FakeEventSource.latest().message(
        message('game-full', {
          sessionId: squadId,
          sessionKind: 'squad',
          divisionId: openId,
          game: 3,
        }),
      )
    })
    const section = async () =>
      (await screen.findByRole('table', { name: 'Results for the Open division' })).closest(
        'section',
      )

    await waitFor(async () => {
      expect((await section())?.className).toMatch(/updated/)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HIGHLIGHT_MS + 100)
    })

    expect((await section())?.className).not.toMatch(/updated/)
  })

  it('shows the messages one at a time, in order, each for about 8 seconds (D-245)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await ready()
    act(() => {
      FakeEventSource.latest().message(
        message('game-full', {
          sessionId: squadId,
          sessionKind: 'squad',
          divisionId: openId,
          game: 3,
        }),
      )
      FakeEventSource.latest().message(
        message('game-full', { sessionId: sweeperId, sessionKind: 'sweeper', game: 2 }),
      )
    })

    expect(await screen.findByText('Open Division – Game 3 complete')).toBeVisible()
    expect(screen.queryByText('Sweeper – Game 2 complete')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTICE_MS + 100)
    })
    expect(screen.getByText('Sweeper – Game 2 complete')).toBeVisible()
  })

  it('loads everything again for a sweeper message, and posts it too', async () => {
    const { calls } = await ready()

    act(() => {
      FakeEventSource.latest().message(
        message('game-full', { sessionId: sweeperId, sessionKind: 'sweeper', game: 2 }),
      )
    })

    expect(await screen.findByText('Sweeper – Game 2 complete')).toBeVisible()
    await waitFor(() => {
      expect(calls.feed).toBe(2)
    })
    expect(calls.division).toEqual([])
  })

  it('posts "Session complete" and loads everything again (D-245)', async () => {
    const { calls } = await ready()

    act(() => {
      FakeEventSource.latest().message(
        message('complete', { sessionId: squadId, sessionKind: 'squad' }),
      )
    })

    expect(await screen.findByText('Session complete – results are official')).toBeVisible()
    await waitFor(() => {
      expect(calls.feed).toBe(2)
    })
  })

  it('refetches a reopened division but posts nothing (D-245)', async () => {
    const { calls } = await ready()

    act(() => {
      FakeEventSource.latest().message(
        message('reopened', { sessionId: squadId, sessionKind: 'squad', divisionId: openId }),
      )
    })

    await waitFor(() => {
      expect(calls.division).toHaveLength(1)
    })
    expect(screen.queryByText(/complete/)).not.toBeInTheDocument()
  })

  it('refetches only the division of a score that filled no game, and posts and outlines nothing', async () => {
    const { calls } = await ready()

    act(() => {
      FakeEventSource.latest().message(
        message('scored', {
          sessionId: squadId,
          sessionKind: 'squad',
          divisionId: openId,
          divisionName: 'Open',
        }),
      )
    })

    await waitFor(() => {
      expect(calls.division).toHaveLength(1)
    })
    expect(calls.feed).toBe(1)
    expect(screen.queryByText(/complete/)).not.toBeInTheDocument()
  })

  it('takes a division off the screen when a cleared score leaves it with no counted game', async () => {
    await ready()
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/results', () =>
        HttpResponse.json(
          createSquadResults({
            session: { ...createSquadResults().session, id: squadId },
            divisions: [openDivision({ throughGame: 0 })],
          }),
        ),
      ),
    )

    act(() => {
      FakeEventSource.latest().message(
        message('reopened', { sessionId: squadId, sessionKind: 'squad', divisionId: openId }),
      )
    })

    await waitFor(() => {
      expect(
        screen.queryByRole('table', { name: 'Results for the Open division' }),
      ).not.toBeInTheDocument()
    })
    // The other division stays, and the page did not fall back to loading everything.
    expect(
      screen.getByRole('table', { name: 'Results for the Senior division' }),
    ).toBeInTheDocument()
  })

  it('loads everything when the division is not in the feed yet (D-244)', async () => {
    const { calls } = await ready()

    act(() => {
      FakeEventSource.latest().message(
        message('game-full', {
          sessionId: squadId,
          sessionKind: 'squad',
          divisionId: '66666666-6666-4666-8666-666666666666',
          game: 1,
        }),
      )
    })

    await waitFor(() => {
      expect(calls.feed).toBe(2)
    })
  })

  it('loads everything for a message it cannot read, and posts nothing', async () => {
    const { calls } = await ready()

    act(() => {
      FakeEventSource.latest().message('{"kind":"game-full","version":1}')
    })

    await waitFor(() => {
      expect(calls.feed).toBe(2)
    })
    expect(screen.queryByText(/Game \d+ complete/)).not.toBeInTheDocument()
  })

  it('loads everything again after the stream comes back from a drop (D-218)', async () => {
    const { calls } = await ready()

    act(() => {
      FakeEventSource.latest().fail()
      FakeEventSource.latest().open()
    })

    await waitFor(() => {
      expect(calls.feed).toBe(2)
    })
  })

  it('loads everything again every minute, whatever the stream says (RES-52, D-246)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { calls } = await ready()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS + 100)
    })

    await waitFor(() => {
      expect(calls.feed).toBe(2)
    })
  })
})

describe('LiveResultsPage offline and keeping alive (RES-52, D-246)', () => {
  it('keeps the last results and says since when they are old, when a refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    serve()
    open_()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })
    server.use(
      http.get('/v1/tournaments/:id/live-results', () => new HttpResponse(null, { status: 503 })),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS + 100)
    })

    expect(await screen.findByText('Out of date')).toBeVisible()
    expect(screen.getByRole('table', { name: 'Results for the Open division' })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Out of date').closest('p')).toHaveTextContent(
      /since \d{1,2}:\d{2} (am|pm)/,
    )
  })

  it('drops the line once a refresh works again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    serve()
    open_()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })
    server.use(
      http.get('/v1/tournaments/:id/live-results', () => new HttpResponse(null, { status: 503 })),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS + 100)
    })
    await screen.findByText('Out of date')
    serve()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS + 100)
    })

    await waitFor(() => {
      expect(screen.queryByText('Out of date')).not.toBeInTheDocument()
    })
  })

  it('asks the browser to keep the screen awake', async () => {
    const request = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }))
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    serve()
    open_()
    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('screen')
    })
    Reflect.deleteProperty(navigator, 'wakeLock')
  })
})

describe('LiveResultsPage with reduced motion (RES-53)', () => {
  it('flips one screen at a time instead of scrolling the list', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
    serve()
    open_()

    await screen.findByRole('table', { name: 'Results for the Open division' }, { timeout: 3000 })

    expect(
      screen.queryByRole('table', { name: 'Results for the Senior division' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/Screen 1 of 4: Squad · Sat 10\/24\/2026 9:00 AM · Open/),
    ).toBeInTheDocument()
  })
})
