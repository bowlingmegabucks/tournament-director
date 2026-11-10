import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMockUser } from '../../mocks/authHandlers'
import { createSignedInUser } from '../../mocks/data'
import { server } from '../../mocks/server'
import { formatSessionDate } from '../../shared/sessionFormat'
import { FakeEventSource } from '../../test/fakeEventSource'
import {
  afterGameOne,
  connect,
  entryUrl,
  openEntry,
  serve,
  sessionId,
  signInKeeper,
  tournament,
  viewOf,
} from './entryTestSupport'

beforeEach(() => {
  signInKeeper()
})

afterEach(() => {
  localStorage.clear()
})

const gameLink = (game: number) => screen.findByRole('link', { name: new RegExp(`^Game ${game}`) })

describe('score entry: the way in (SCR-21)', () => {
  it('starts on the first game that misses a score (SCR-21)', async () => {
    serve()
    openEntry()

    const link = await gameLink(2)
    expect(link).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /^Game 1/ })).not.toHaveAttribute('aria-current')
  })

  it('starts on game 1 when every score is in', async () => {
    serve(viewOf({ ann: [1, 1, 1], bea: [1, 1, 1], cal: [1, 1, 1], dee: [1, 1, 1] }))
    openEntry()
    expect(await gameLink(1)).toHaveAttribute('aria-current', 'true')
  })

  it('goes to the first open game from a game the session does not have', async () => {
    serve()
    openEntry('/9')
    expect(await gameLink(2)).toHaveAttribute('aria-current', 'true')
  })

  it('goes to the first open game from a game that is not a number', async () => {
    serve()
    openEntry('/abc')
    expect(await gameLink(2)).toHaveAttribute('aria-current', 'true')
  })

  it('sends a signed-out visitor to sign in (SCR-21, D-96)', async () => {
    setMockUser(null)
    serve()
    openEntry('/2')
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeVisible()
  })

  it('tells a signed-in user without the score permission they may not (D-96)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'], permissions: ['lanes.read'] }))
    serve()
    openEntry('/2')
    expect(await screen.findByText(/not allowed|permission/i)).toBeVisible()
  })

  it('shows loading, then an error with Try again (SCR-21)', async () => {
    serve()
    let failing = true
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/scores/games', () =>
        failing ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(viewOf(afterGameOne)),
      ),
    )
    openEntry('/2')

    expect(await screen.findByText('Loading the games…')).toBeVisible()
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'Failed to load the games (503)',
    )
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await gameLink(2)).toBeVisible()
  })

  it('shows the setup message when pairs cannot be worked out (LAN-02)', async () => {
    serve()
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/scores/games', () =>
        HttpResponse.json({ message: 'Bowlers per pair must be 2 to 5' }, { status: 422 }),
      ),
    )
    openEntry('/2')
    expect(await screen.findByRole('alert')).toHaveTextContent('Bowlers per pair must be 2 to 5')
  })

  it('says the page title with the date and tournament (SCR-21)', async () => {
    serve()
    openEntry('/2')
    await gameLink(2)
    await waitFor(() => {
      expect(document.title).toBe(
        `Enter scores · ${formatSessionDate('2026-10-24T09:00:00')} · Spring Open · Tournament Director`,
      )
    })
  })
})

describe('score entry: the game board (SCR-21, D-230)', () => {
  it('shows each game with how many scores are in (D-230)', async () => {
    serve()
    openEntry('/2')
    expect(await gameLink(1)).toHaveTextContent('4 of 4 ✓')
    expect(screen.getByRole('link', { name: /^Game 2/ })).toHaveTextContent('0 of 4')
    expect(screen.getByRole('link', { name: /^Game 3/ })).toHaveTextContent('0 of 4')
  })

  it('lists the pairs as they are bowled in the picked game, each with its count (D-230)', async () => {
    serve(viewOf({ ...afterGameOne, cal: [200, 210, null] }))
    openEntry('/2')

    const tiles = within(await screen.findByRole('list', { name: 'Pairs for game 2' }))
    const links = tiles.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      entryUrl('/2/1'),
      entryUrl('/2/3'),
    ])
    expect(links[0]).toHaveTextContent('Lanes 1-2')
    expect(links[0]).toHaveTextContent('◐ 1 of 2 in')
    expect(links[1]).toHaveTextContent('○ 0 of 2 in')
  })

  it('marks a pair with every score in (SCR-21)', async () => {
    serve(viewOf({ ...afterGameOne, cal: [200, 210, null], dee: [190, 205, null] }))
    openEntry('/2')
    const tiles = within(await screen.findByRole('list', { name: 'Pairs for game 2' }))
    expect(tiles.getAllByRole('link')[0]).toHaveTextContent('✓ 2 of 2 in')
  })

  it('marks the pair whose sheet is open (SCR-21)', async () => {
    serve()
    openEntry('/2/3')
    const tiles = within(await screen.findByRole('list', { name: 'Pairs for game 2' }))
    const [first, second] = tiles.getAllByRole('link')
    expect(second).toHaveAttribute('aria-current', 'page')
    expect(first).not.toHaveAttribute('aria-current')
  })

  it('says to pick a pair while none is open, and shows the board on its own (SCR-21)', async () => {
    serve()
    openEntry('/2')
    expect(await screen.findByText('Pick a pair to enter its scores.')).toBeVisible()
  })

  it('says no one has a lane when no game lists a pair (SCR-21)', async () => {
    serve({
      ...viewOf(),
      games: viewOf().games.map((game) => ({ ...game, pairs: [], total: 0, entered: 0 })),
    })
    openEntry('/1')
    expect(await screen.findByText('No one has a lane yet. Assign lanes first.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go to Lane assignments' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/squads/${sessionId}/lanes`,
    )
  })

  it('counts the bowlers who have no lane (D-71)', async () => {
    serve({ ...viewOf(), withoutLane: 2 })
    openEntry('/1')
    expect(await screen.findByText(/2 bowlers have no lane and cannot be entered/)).toBeVisible()
  })

  it('shows Live once the stream connects, and reconnecting when it drops (D-232)', async () => {
    serve()
    openEntry('/2')
    await gameLink(2)
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting')
    connect()
    expect(screen.getByRole('status')).toHaveTextContent('Live: changes by others show here')
    act(() => {
      FakeEventSource.latest().fail()
    })
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting')
  })

  it('opens the public score stream of the session (SCR-20)', async () => {
    serve()
    openEntry('/2')
    await gameLink(2)
    expect(FakeEventSource.latest().url).toBe(
      `/v1/tournaments/${tournament.id}/squads/${sessionId}/scores/events`,
    )
  })

  it('refetches the games on a message (D-218, D-232)', async () => {
    const api = serve()
    openEntry('/2')
    await gameLink(2)
    connect()
    const before = api.asked()

    act(() => {
      FakeEventSource.latest().message('{"kind":"scores","version":1}')
    })

    await waitFor(() => {
      expect(api.asked()).toBe(before + 1)
    })
  })

  it('is read only and opens no stream on a complete session (D-231)', async () => {
    serve(viewOf(afterGameOne, { complete: true }))
    openEntry('/2/1')

    expect(
      await screen.findAllByText('This squad is complete. Scores cannot change.'),
    ).not.toHaveLength(0)
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(screen.getByRole('textbox', { name: /Cal Ode, game 2/ })).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: /^Next/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Done/ })).not.toBeInTheDocument()
  })

  describe('Find a bowler (D-230, D-236)', () => {
    it('finds a bowler in the picked game and opens that pair', async () => {
      serve()
      openEntry('/2')
      await userEvent.type(await screen.findByRole('searchbox', { name: 'Find a bowler' }), 'dee')

      const hit = within(screen.getByRole('list', { name: 'Bowlers found' })).getByRole('link')
      expect(hit).toHaveTextContent('Dee Park')
      expect(hit).toHaveTextContent('Game 2 · 1B')
      expect(hit).toHaveAttribute('href', entryUrl('/2/1'))
    })

    it('says when no bowler matches, and shows nothing for nothing typed', async () => {
      serve()
      openEntry('/2')
      const box = await screen.findByRole('searchbox', { name: 'Find a bowler' })
      expect(screen.queryByRole('list', { name: 'Bowlers found' })).not.toBeInTheDocument()

      await userEvent.type(box, 'zzz')

      expect(screen.getByText('No bowler matches that.')).toBeVisible()
    })
  })

  describe('the lanes you work (D-230)', () => {
    it('hides the pairs outside the range, and keeps the range for the next visit', async () => {
      serve()
      const first = openEntry('/2')
      await userEvent.type(await screen.findByRole('textbox', { name: 'From lane' }), '3')
      await userEvent.type(screen.getByRole('textbox', { name: 'To lane' }), '4')

      const tiles = within(screen.getByRole('list', { name: 'Pairs for game 2' }))
      expect(tiles.getAllByRole('link')).toHaveLength(1)
      expect(tiles.getByRole('link')).toHaveTextContent('Lanes 3-4')
      first.unmount()

      openEntry('/2')
      expect(await screen.findByRole('textbox', { name: 'From lane' })).toHaveValue('3')
      expect(screen.getByRole('textbox', { name: 'To lane' })).toHaveValue('4')
    })

    it('takes only digits, and Show all clears the range', async () => {
      serve()
      openEntry('/2')
      const from = await screen.findByRole('textbox', { name: 'From lane' })
      await userEvent.type(from, '3x')
      expect(from).toHaveValue('3')
      expect(from).toHaveAttribute('inputmode', 'numeric')

      await userEvent.click(screen.getByRole('button', { name: 'Show all' }))

      expect(from).toHaveValue('')
      expect(screen.queryByRole('button', { name: 'Show all' })).not.toBeInTheDocument()
      expect(
        within(screen.getByRole('list', { name: 'Pairs for game 2' })).getAllByRole('link'),
      ).toHaveLength(2)
    })

    it('says so when no pair is in the range', async () => {
      serve()
      openEntry('/2')
      await userEvent.type(await screen.findByRole('textbox', { name: 'From lane' }), '41')
      await userEvent.type(screen.getByRole('textbox', { name: 'To lane' }), '60')
      expect(screen.getByText('No pair with bowlers in lanes 41 to 60 in game 2.')).toBeVisible()
    })

    it('works when storage is off (a private window)', async () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('off')
      })
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('off')
      })
      serve()
      openEntry('/2')

      await userEvent.type(await screen.findByRole('textbox', { name: 'From lane' }), '3')

      expect(screen.getByRole('textbox', { name: 'From lane' })).toHaveValue('3')
      getItem.mockRestore()
      setItem.mockRestore()
    })

    it('starts from every lane when the stored range is not a range', async () => {
      localStorage.setItem(`scoreEntryLanes:${sessionId}`, '{"from":1}')
      serve()
      openEntry('/2')
      expect(await screen.findByRole('textbox', { name: 'From lane' })).toHaveValue('')
    })
  })

  describe('the skip (SCR-23, D-235)', () => {
    it('shows the stored skip, and saves a change, then shows the new lanes', async () => {
      const api = serve()
      openEntry('/2')
      expect(await screen.findByRole('radio', { name: 'Staggered' })).toBeChecked()

      await userEvent.click(screen.getByRole('radio', { name: 'Same' }))

      await waitFor(() => {
        expect(screen.getByRole('radio', { name: 'Same' })).toBeChecked()
      })
      expect(api.skipPuts).toEqual([{ skip: 'same' }])
    })

    it('says why a skip could not be saved (D-231)', async () => {
      serve()
      server.use(
        http.put('/v1/tournaments/:id/squads/:sessionId/skip', () =>
          HttpResponse.json(
            { message: 'This squad is complete. The skip cannot change.' },
            { status: 409 },
          ),
        ),
      )
      openEntry('/2')
      await userEvent.click(await screen.findByRole('radio', { name: 'Same' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('The skip cannot change')
      expect(screen.getByRole('radio', { name: 'Staggered' })).toBeChecked()
    })

    it('turns the radios off on a complete session (D-231)', async () => {
      serve(viewOf(afterGameOne, { complete: true }))
      openEntry('/2')
      expect(await screen.findByRole('radio', { name: 'Same' })).toBeDisabled()
    })
  })
})
