import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createLaneBowler,
  createLanePage,
  createLanePair,
  createSquad,
  createSweeper,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import { applyMoves, planMove } from './optimisticMove'
import type { LaneBowler, LanePage } from './types'

export const tournament = createTournament({ name: 'Spring Open' })

/** One saved move, as the page sent it. */
export interface Put {
  registrationId: string
  lane: number | null
}

/**
 * Serve the lane page for the squad or sweeper it describes, with a matching session list for the
 * header, and a move route that behaves like the API: it refuses a full pair, picks the first free
 * seat, remembers the move, and answers the position. A read after a save shows the move, as a
 * real refetch would. `current()` is what the "server" holds; `puts` is what the page sent.
 */
export function serve(page: LanePage) {
  const { session } = page
  const head = { id: session.id, date: session.date, complete: session.complete }
  let stored = page
  const puts: Put[] = []
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/squads', () =>
      HttpResponse.json({ squads: session.kind === 'squad' ? [createSquad(head)] : [] }),
    ),
    http.get('/v1/tournaments/:id/sweepers', () =>
      HttpResponse.json({ sweepers: session.kind === 'sweeper' ? [createSweeper(head)] : [] }),
    ),
    http.get('/v1/tournaments/:id/squads/:sessionId/lanes', () => HttpResponse.json(stored)),
    http.get('/v1/tournaments/:id/sweepers/:sessionId/lanes', () => HttpResponse.json(stored)),
    http.put(
      '/v1/tournaments/:id/:kind/:sessionId/lanes/:registrationId',
      async ({ params, request }) => {
        const body = (await request.json()) as { lane: number | null }
        const registrationId = String(params['registrationId'])
        puts.push({ registrationId, lane: body.lane })
        const everyone = [...stored.pairs.flatMap((pair) => pair.bowlers), ...stored.unassigned]
        const bowler = everyone.find((candidate) => candidate.registrationId === registrationId)
        if (!bowler)
          return HttpResponse.json({ message: 'Bowler is not registered' }, { status: 404 })
        const pair = stored.pairs.find((candidate) => candidate.firstLane === body.lane)
        if (body.lane !== null && !pair) {
          return HttpResponse.json({ message: 'Not a pair' }, { status: 400 })
        }
        if (pair && pair.bowlers.length >= pair.capacity) {
          return HttpResponse.json({ message: 'Pair is full' }, { status: 409 })
        }
        const move = planMove(bowler, pair ?? 'unassigned')
        stored = applyMoves(stored, new Map([[registrationId, move]]))
        return HttpResponse.json({ position: move.position })
      },
    ),
  )
  return { puts, current: () => stored, replace: (next: LanePage) => (stored = next) }
}

export const open = (page: LanePage) =>
  renderApp(`/tournaments/${tournament.id}/${page.session.kind}s/${page.session.id}/lanes`)

export const pat = createLaneBowler({
  name: 'Pat Nguyen',
  divisionName: 'Women',
  average: 168,
  pins: 47,
})
export const carl = createLaneBowler({ name: 'Carl Dubois', average: 205, pins: 14 })
export const joe = createLaneBowler({ name: 'Joe Fontaine', position: '1A', pins: 0 })
export const dana = createLaneBowler({ name: 'Dana Abbott', position: '2C', pins: 21 })

export function filled(): LanePage {
  const full: LaneBowler[] = Array.from({ length: 5 }, (_, index) =>
    createLaneBowler({
      name: `Full ${index}`,
      position: ['3A', '3B', '4C', '4D', '4E'][index] ?? '',
    }),
  )
  return createLanePage({
    pairs: [
      createLanePair(1, [joe, dana]),
      createLanePair(3, full),
      createLanePair(5, []),
      createLanePair(7, []),
      createLanePair(9, []),
    ],
    unassigned: [carl, pat],
    divisions: [
      { id: 'd1', number: 1, name: 'Open', entries: 8 },
      { id: 'd2', number: 2, name: 'Women', entries: 1 },
    ],
  })
}
