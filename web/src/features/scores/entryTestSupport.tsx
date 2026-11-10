import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setMockUser } from '../../mocks/authHandlers'
import { createSignedInUser, createSquad, createSweeper, createTournament } from '../../mocks/data'
import {
  createGame,
  createGameBowler,
  createGamePair,
  createGamesView,
} from '../../mocks/gamesData'
import { server } from '../../mocks/server'
import { FakeEventSource } from '../../test/fakeEventSource'
import { renderApp } from '../../test/renderApp'
import type { GameBowler, GamesView } from './gamesTypes'
import { applySaved } from './entryLogic'

export const tournament = createTournament({ name: 'Spring Open' })

/** Four bowlers on two pairs. They swap pairs between games, as a cross does (LAN-19). */
export const ann = createGameBowler({ registrationId: 'ann', name: 'Ann Lee', lane: '1A' })
export const bea = createGameBowler({ registrationId: 'bea', name: 'Bea Moss', lane: '1B' })
export const cal = createGameBowler({ registrationId: 'cal', name: 'Cal Ode', lane: '3A' })
export const dee = createGameBowler({ registrationId: 'dee', name: 'Dee Park', lane: '3B' })

type Scores = Record<string, (number | null)[]>

/**
 * A squad of three games: game 1 puts Ann and Bea on lanes 1-2 and Cal and Dee on 3-4; in game 2
 * the pairs trade (Cal and Dee on 1-2, Ann and Bea on 3-4); game 3 is as game 1. `scores` is each
 * bowler's games.
 */
export function viewOf(scores: Scores = {}, options: { complete?: boolean } = {}): GamesView {
  const row = (bowler: GameBowler, game: number, lane: string): GameBowler => {
    const all = scores[bowler.registrationId] ?? [null, null, null]
    return {
      ...bowler,
      lane,
      scores: all,
      score: all[game - 1] ?? null,
      total: all.reduce<number>((sum, score) => sum + (score ?? 0), 0),
    }
  }
  const one = createGame(1, [
    createGamePair(1, [row(ann, 1, '1A'), row(bea, 1, '1B')]),
    createGamePair(3, [row(cal, 1, '3A'), row(dee, 1, '3B')]),
  ])
  const two = createGame(2, [
    createGamePair(1, [row(cal, 2, '1A'), row(dee, 2, '1B')]),
    createGamePair(3, [row(ann, 2, '3A'), row(bea, 2, '3B')]),
  ])
  const three = createGame(3, [
    createGamePair(1, [row(ann, 3, '1A'), row(bea, 3, '1B')]),
    createGamePair(3, [row(cal, 3, '3A'), row(dee, 3, '3B')]),
  ])
  return createGamesView({
    session: {
      id: sessionId,
      kind: 'squad',
      date: '2026-10-24T09:00:00',
      complete: options.complete ?? false,
      games: 3,
    },
    games: [one, two, three],
  })
}

export const sessionId = 'a0000000-0000-4000-8000-0000000000aa'

/** The scores every bowler holds when game 1 is done and nobody has bowled game 2. */
export const afterGameOne: Scores = {
  ann: [180, null, null],
  bea: [170, null, null],
  cal: [200, null, null],
  dee: [190, null, null],
}

export interface Served {
  /** Swap what the next ask returns, as another keeper's save would. */
  replace: (next: GamesView) => void
  current: () => GamesView
  asked: () => number
  puts: { registrationId: string; game: number; body: unknown; method: string }[]
  skipPuts: unknown[]
}

/**
 * Serve the portal's header lists, the games, and the save, skip, and live routes for one squad.
 * A save lands in `current`, as the API would store it, and answers the bowler's scores.
 */
export function serve(first: GamesView = viewOf(afterGameOne)): Served {
  let view = first
  let asked = 0
  const served: Served = {
    replace: (next) => {
      view = next
    },
    current: () => view,
    asked: () => asked,
    puts: [],
    skipPuts: [],
  }
  const head = {
    id: sessionId,
    date: view.session.date,
    complete: view.session.complete,
  }
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/settings', () =>
      HttpResponse.json({
        settings: {
          games: 3,
          entryFee: 50,
          finalsRatio: 7,
          cashRatio: 5,
          superSweeperCashRatio: 5,
          completed: false,
        },
      }),
    ),
    http.get('/v1/tournaments/:id/squads', () =>
      HttpResponse.json({ squads: [createSquad(head)] }),
    ),
    http.get('/v1/tournaments/:id/sweepers', () =>
      HttpResponse.json({ sweepers: [createSweeper()] }),
    ),
    http.get('/v1/tournaments/:id/squads/:sessionId/scores/games', () => {
      asked += 1
      return HttpResponse.json(view)
    }),
    http.put(
      '/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/:game',
      async ({ params, request }) => {
        const body = (await request.json()) as { score: number }
        const registrationId = String(params['registrationId'])
        const game = Number(params['game'])
        served.puts.push({ registrationId, game, body, method: 'PUT' })
        const before = view.games[0]?.pairs
          .flatMap((pair) => pair.bowlers)
          .find((b) => b.registrationId === registrationId)
        const row = Array.from({ length: 3 }, (_, index) => before?.scores[index] ?? null)
        const scores = row.map((value, index) => {
          if (index + 1 === game) return body.score
          return index + 1 < game && value === null ? 0 : value
        })
        const total = scores.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        view = applySaved(view, registrationId, { scores, total })
        return HttpResponse.json({ scores, total })
      },
    ),
    http.delete(
      '/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/:game',
      ({ params }) => {
        const registrationId = String(params['registrationId'])
        const game = Number(params['game'])
        served.puts.push({ registrationId, game, body: undefined, method: 'DELETE' })
        const before = view.games[0]?.pairs
          .flatMap((pair) => pair.bowlers)
          .find((b) => b.registrationId === registrationId)
        const scores = Array.from({ length: 3 }, (_, index) =>
          index + 1 === game ? null : (before?.scores[index] ?? null),
        )
        const total = scores.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        view = applySaved(view, registrationId, { scores, total })
        return HttpResponse.json({ scores, total })
      },
    ),
    http.put('/v1/tournaments/:id/squads/:sessionId/skip', async ({ request }) => {
      const body = (await request.json()) as { skip: 'staggered' | 'same' }
      served.skipPuts.push(body)
      view = { ...view, skip: body.skip }
      return HttpResponse.json({ skip: body.skip })
    }),
  )
  return served
}

export const signInKeeper = () => {
  setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
}

export const entryUrl = (path = '') =>
  `/tournaments/${tournament.id}/squads/${sessionId}/scores/entry${path}`

export function openEntry(path = '') {
  return renderApp(entryUrl(path))
}

/** The stream comes up, as it does a moment after the page loads. */
export function connect() {
  act(() => {
    FakeEventSource.latest().open()
  })
}

export const boxOf = (name: string, game: number) =>
  screen.findByRole('textbox', { name: new RegExp(`${name}, game ${game}$`) })
