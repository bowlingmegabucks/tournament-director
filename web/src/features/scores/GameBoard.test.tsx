import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMockUser } from '../../mocks/authHandlers'
import { createSignedInUser } from '../../mocks/data'
import {
  createGame,
  createGameBowler,
  createGamePair,
  createGamesView,
} from '../../mocks/gamesData'
import { server } from '../../mocks/server'
import type { LaneRange } from './entryLogic'
import type { GamesView } from './gamesTypes'
import { GameBoard } from './GameBoard'

const ann = (score: number | null) =>
  createGameBowler({ registrationId: 'ann', name: 'Ann Lee', lane: '1A', score })
const bea = (score: number | null) =>
  createGameBowler({ registrationId: 'bea', name: 'Bea Moss', lane: '1B', score })
const cal = (score: number | null) =>
  createGameBowler({ registrationId: 'cal', name: 'Cal Ode', lane: '3A', score })

const none: LaneRange = { from: '', to: '' }

function viewOf(overrides: Partial<GamesView> = {}): GamesView {
  return createGamesView({
    games: [
      createGame(1, [createGamePair(1, [ann(200), bea(180)]), createGamePair(3, [cal(null)])]),
      createGame(2, [createGamePair(1, [ann(null), bea(null)]), createGamePair(3, [cal(null)])]),
      createGame(3),
    ],
    ...overrides,
  })
}

function renderBoard(
  props: {
    view?: GamesView
    game?: number
    active?: number
    readOnly?: boolean
    range?: LaneRange
    onRange?: (next: LaneRange) => void
  } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GameBoard
          kind="squad"
          tournamentId="t1"
          sessionId="s1"
          view={props.view ?? viewOf()}
          game={props.game ?? 1}
          active={props.active}
          state="live"
          readOnly={props.readOnly ?? false}
          range={props.range ?? none}
          onRange={props.onRange ?? (() => undefined)}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  setMockUser(createSignedInUser({ roles: ['director'] }))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('GameBoard progress (SCR-21)', () => {
  it('marks a pair by how many scores are in, in a symbol and in the words', () => {
    renderBoard()
    const pairs = within(screen.getByRole('list', { name: 'Pairs for game 1' }))
    expect(pairs.getByRole('link', { name: /Lanes 1-2/ })).toHaveTextContent('✓ 2 of 2 in')
    expect(pairs.getByRole('link', { name: /Lanes 3-4/ })).toHaveTextContent('○ 0 of 1 in')
  })

  it('marks a part-scored pair with its own symbol and style', () => {
    renderBoard({
      view: viewOf({
        games: [createGame(1, [createGamePair(1, [ann(200), bea(null)])]), createGame(2)],
      }),
    })
    const part = screen.getByText('◐ 1 of 2 in')
    const wait = renderBoardWaitingText()
    expect(part.className).toMatch(/part/)
    expect(part.className).not.toBe(wait.className)
  })

  function renderBoardWaitingText() {
    renderBoard({
      view: viewOf({ games: [createGame(1, [createGamePair(1, [ann(null)])]), createGame(2)] }),
    })
    return screen.getByText('○ 0 of 1 in')
  }

  it('styles a waiting pair as waiting', () => {
    renderBoard({
      view: viewOf({ games: [createGame(1, [createGamePair(1, [ann(null)])]), createGame(2)] }),
    })
    expect(screen.getByText('○ 0 of 1 in').className).toMatch(/wait/)
  })

  it('shows each game with its count, and a tick only when every score is in', () => {
    renderBoard({
      view: viewOf({
        games: [
          createGame(1, [createGamePair(1, [ann(200), bea(180)])]),
          createGame(2, [createGamePair(1, [ann(150), bea(null)])]),
          createGame(3),
        ],
      }),
    })
    const games = within(screen.getByRole('navigation', { name: 'Game' }))
    expect(games.getByRole('link', { name: /Game 1/ })).toHaveTextContent('2 of 2 ✓')
    expect(games.getByRole('link', { name: /Game 2/ })).toHaveTextContent(/^Game 21 of 2$/)
    expect(games.getByRole('link', { name: /Game 3/ })).toHaveTextContent(/^Game 30 of 0$/)
  })

  it('marks the picked game as current, and no other', () => {
    renderBoard({ game: 2 })
    const games = within(screen.getByRole('navigation', { name: 'Game' }))
    expect(games.getByRole('link', { name: /Game 2/ })).toHaveAttribute('aria-current', 'true')
    expect(games.getByRole('link', { name: /Game 1/ })).not.toHaveAttribute('aria-current')
  })
})

describe('GameBoard skip (SCR-23, D-235)', () => {
  it('checks the stored skip and only it', () => {
    renderBoard({ view: viewOf({ skip: 'same' }) })
    expect(screen.getByRole('radio', { name: 'Same' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Staggered' })).not.toBeChecked()
  })

  it('saves the pattern a keeper picks', async () => {
    const sent: unknown[] = []
    server.use(
      http.put('/v1/tournaments/t1/squads/s1/skip', async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json({ skip: 'same' })
      }),
    )
    renderBoard()

    await userEvent.click(screen.getByRole('radio', { name: 'Same' }))

    await vi.waitFor(() => {
      expect(sent).toEqual([{ skip: 'same' }])
    })
  })

  it('saves staggered when the keeper goes back to it', async () => {
    const sent: unknown[] = []
    server.use(
      http.put('/v1/tournaments/t1/squads/s1/skip', async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json({ skip: 'staggered' })
      }),
    )
    renderBoard({ view: viewOf({ skip: 'same' }) })

    await userEvent.click(screen.getByRole('radio', { name: 'Staggered' }))

    await vi.waitFor(() => {
      expect(sent).toEqual([{ skip: 'staggered' }])
    })
  })
})

describe('GameBoard with no one on a lane (SCR-21, D-71)', () => {
  const empty = (withoutLane: number) =>
    viewOf({ games: [createGame(1), createGame(2)], withoutLane })

  it('says to assign lanes first, and offers the lane page to those who may open it', async () => {
    renderBoard({ view: empty(0) })
    expect(screen.getByText('No one has a lane yet. Assign lanes first.')).toBeVisible()
    expect(await screen.findByRole('link', { name: 'Go to Lane assignments' })).toHaveAttribute(
      'href',
      '/tournaments/t1/squads/s1/lanes',
    )
    expect(screen.queryByText(/no lane\.$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
  })

  it('counts the bowlers without a lane, in the singular and the plural', () => {
    renderBoard({ view: empty(1) })
    expect(screen.getByText('1 bowler has no lane.')).toBeVisible()
    renderBoard({ view: empty(3) })
    expect(screen.getByText('3 bowlers have no lane.')).toBeVisible()
  })

  it('shows the board once any one game lists a pair', () => {
    renderBoard({
      view: viewOf({ games: [createGame(1), createGame(2, [createGamePair(1, [ann(null)])])] }),
    })
    expect(screen.queryByText('No one has a lane yet. Assign lanes first.')).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Find a bowler' })).toBeVisible()
  })
})

describe('GameBoard with bowlers on a lane', () => {
  it('counts the bowlers without a lane under the pairs', () => {
    renderBoard({ view: viewOf({ withoutLane: 1 }) })
    expect(screen.getByText('1 bowler has no lane and cannot be entered here.')).toBeVisible()
    renderBoard({ view: viewOf({ withoutLane: 2 }) })
    expect(screen.getByText('2 bowlers have no lane and cannot be entered here.')).toBeVisible()
  })

  it('says nothing about bowlers without a lane when there are none', () => {
    renderBoard({ view: viewOf({ withoutLane: 0 }) })
    expect(screen.queryByText(/no lane and cannot/)).not.toBeInTheDocument()
  })

  it('scrolls to the open pair, and to no other', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    renderBoard({ active: 3 })
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
    expect(scroll.mock.contexts[0]).toBe(screen.getByRole('link', { name: /Lanes 3-4/ }))
  })

  it('does not scroll when no pair is open', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    renderBoard()
    expect(scroll).not.toHaveBeenCalled()
  })

  it('keeps Enter in the lane boxes from sending the page', () => {
    renderBoard()
    const form = screen.getByRole('form', { name: 'Lanes you work' })
    expect(fireEvent.submit(form)).toBe(false)
  })
})

describe('GameBoard Find a bowler (D-230, D-236)', () => {
  it('shows nothing for an empty or blank query', async () => {
    renderBoard()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a bowler' }), '   ')
    expect(screen.queryByText('No bowler matches that.')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Bowlers found' })).not.toBeInTheDocument()
  })

  it('lists a match with its game and lane, and says when none match', async () => {
    renderBoard()
    const box = screen.getByRole('searchbox', { name: 'Find a bowler' })

    await userEvent.type(box, 'bea')
    const found = within(screen.getByRole('list', { name: 'Bowlers found' }))
    expect(found.getByRole('link', { name: /Bea Moss/ })).toHaveTextContent('Game 1 · 1B')

    await userEvent.clear(box)
    await userEvent.type(box, 'zed')
    expect(screen.getByText('No bowler matches that.')).toBeVisible()
  })
})

describe('GameBoard lanes you work (D-230)', () => {
  it('offers Show all when only one end is set, and clears both', async () => {
    const onRange = vi.fn()
    const { rerender } = renderBoard({ range: { from: '3', to: '' }, onRange })
    expect(screen.getByRole('button', { name: 'Show all' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(onRange).toHaveBeenCalledWith({ from: '', to: '' })
    rerender(<div />)
    renderBoard({ range: { from: '', to: '4' } })
    expect(screen.getByRole('button', { name: 'Show all' })).toBeVisible()
  })

  it('has no Show all while every lane shows', () => {
    renderBoard()
    expect(screen.queryByRole('button', { name: 'Show all' })).not.toBeInTheDocument()
  })

  it('keeps digits only as the keeper types, and the other end as it was', async () => {
    const onRange = vi.fn()
    renderBoard({ range: { from: '', to: '8' }, onRange })
    await userEvent.type(screen.getByRole('textbox', { name: 'From lane' }), '5')
    expect(onRange).toHaveBeenLastCalledWith({ from: '5', to: '8' })
    fireEvent.change(screen.getByRole('textbox', { name: 'To lane' }), { target: { value: '1x2' } })
    expect(onRange).toHaveBeenLastCalledWith({ from: '', to: '12' })
  })

  it('says which lanes hold no pair, with "any" for an open end', () => {
    renderBoard({ range: { from: '9', to: '' } })
    expect(screen.getByText('No pair with bowlers in lanes 9 to any in game 1.')).toBeVisible()
    renderBoard({ range: { from: '', to: '0' } })
    expect(screen.getByText('No pair with bowlers in lanes any to 0 in game 1.')).toBeVisible()
  })
})

describe('GameBoard on a complete session (D-231)', () => {
  it('says it is read only and offers no skip change', () => {
    renderBoard({ readOnly: true })
    expect(screen.getByText('This squad is complete. Scores cannot change.')).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Same' })).toBeDisabled()
  })
})

describe('GameBoard progress with a bowler who did not finish (SCR-24, D-248)', () => {
  const walked = createGameBowler({
    registrationId: 'dee',
    name: 'Dee Park',
    lane: '1B',
    score: null,
    dnf: true,
  })

  it('does not wait for the bowler who walked off: 1 of 1 in, with a check', () => {
    const view = createGamesView({
      games: [createGame(3, [createGamePair(1, [ann(200), walked])])],
    })

    renderBoard({ view, game: 3 })

    expect(screen.getByText('✓ 1 of 1 in')).toBeInTheDocument()
    expect(screen.getByText(/^1 of 1/)).toBeInTheDocument()
  })

  it('still counts a flagged bowler who has a score in the game', () => {
    const scored = createGameBowler({ registrationId: 'dee', lane: '1B', score: 150, dnf: true })
    const view = createGamesView({
      games: [createGame(1, [createGamePair(1, [ann(200), scored])])],
    })

    renderBoard({ view, game: 1 })

    expect(screen.getByText('✓ 2 of 2 in')).toBeInTheDocument()
  })

  it('shows a pair that still waits on a bowler as partly in', () => {
    const view = createGamesView({
      games: [createGame(2, [createGamePair(1, [ann(200), bea(null), walked])])],
    })

    renderBoard({ view, game: 2 })

    expect(screen.getByText('◐ 1 of 2 in')).toBeInTheDocument()
  })
})
