import request from 'supertest'
import { describe, expect, it } from 'vitest'
import {
  createDivision,
  createLaneEntry,
  createSquad,
  createSweeper,
  createTournament,
} from '../../test/factories.ts'
import { createSignedInTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { recapSheetsSchema } from './types.ts'

function setup(options: { maxPerPair?: number } = {}) {
  const tournament = createTournament()
  const other = createTournament()
  const open = createDivision({ number: 1, name: 'Open' })
  const squad = createSquad({ numberOfLanes: 16, maxPerPair: options.maxPerPair ?? 4, games: 5 })
  const sweeper = createSweeper({
    startingLane: 11,
    numberOfLanes: 4,
    maxPerPair: 4,
    games: 4,
    bonusPins: [{ divisionId: open.id, divisionName: 'Open', bonusPinsPerGame: 12 }],
  })
  const app = createSignedInTestApp({
    tournaments: createInMemoryTournamentRepository([tournament, other]),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division: open }]),
    squads: createInMemorySquadRepository([
      { tournamentId: tournament.id, squad },
      { tournamentId: other.id, squad: createSquad() },
    ]),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
    lanes: createInMemoryLaneRepository([
      { sessionId: squad.id, entry: createLaneEntry({ divisionId: open.id, position: '1A' }) },
      { sessionId: squad.id, entry: createLaneEntry({ divisionId: open.id, position: '' }) },
      { sessionId: sweeper.id, entry: createLaneEntry({ divisionId: open.id, position: '11A' }) },
    ]),
  })
  return { app, tournament, other, squad, sweeper }
}

describe('GET /v1/tournaments/:id/squads/:sessionId/recap-sheets (RPT-08)', () => {
  it('returns a sheet for each bowler with a lane, and the games of the tournament (RPT-05c)', async () => {
    const { app, tournament, squad } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/recap-sheets`,
    )

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(recapSheetsSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.session).toMatchObject({ id: squad.id, kind: 'squad', games: 5 })
    expect(response.body.sheets).toHaveLength(1)
    expect(response.body.sheets[0].cross.same).toHaveLength(5)
    expect(response.body.withoutLane).toBe(1)
  })

  it('answers 404 for an unknown tournament', async () => {
    const { app, squad } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${createTournament().id}/squads/${squad.id}/recap-sheets`,
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('answers 404 for a squad of another tournament', async () => {
    const { app, tournament, other } = setup()
    const otherSquad = createSquad()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${otherSquad.id}/recap-sheets`,
    )
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Squad not found' })
    expect(other.id).not.toBe(tournament.id)
  })

  it('answers 404 for a sweeper id under squads', async () => {
    const { app, tournament, sweeper } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${sweeper.id}/recap-sheets`,
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Squad not found' })
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const { app, squad } = setup()

    const response = await request(app).get(`/v1/tournaments/nope/squads/${squad.id}/recap-sheets`)

    expect(response.status).toBe(400)
  })

  it.each([1, 6])('answers 422 when bowlers per pair is %i (LAN-02)', async (maxPerPair) => {
    const { app, tournament, squad } = setup({ maxPerPair })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/recap-sheets`,
    )

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ message: 'Bowlers per pair must be 2 to 5 to assign lanes' })
  })

  it.each([2, 5])(
    'accepts %i bowlers per pair, the ends of the range (LAN-02)',
    async (maxPerPair) => {
      const { app, tournament, squad } = setup({ maxPerPair })

      const response = await request(app).get(
        `/v1/tournaments/${tournament.id}/squads/${squad.id}/recap-sheets`,
      )

      expect(response.status).toBe(200)
    },
  )

  it("counts an entry whose division is not the tournament's, and gives it no sheet (D-51, D-65)", async () => {
    const tournament = createTournament()
    const squad = createSquad()
    const open = createDivision()
    const app = createSignedInTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      divisions: createInMemoryDivisionRepository([
        { tournamentId: tournament.id, division: open },
      ]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
      lanes: createInMemoryLaneRepository([
        { sessionId: squad.id, entry: createLaneEntry({ divisionId: open.id, position: '1A' }) },
        { sessionId: squad.id, entry: createLaneEntry({ position: '3A' }) },
      ]),
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/recap-sheets`,
    )

    expect(response.status).toBe(200)
    expect(response.body.sheets).toHaveLength(1)
    expect(response.body.withoutDivision).toBe(1)
    expect(response.body.withoutLane).toBe(0)
  })

  it('returns no sheets for a squad nobody has a lane in (RPT-05c)', async () => {
    const tournament = createTournament()
    const squad = createSquad()
    const app = createSignedInTestApp({
      tournaments: createInMemoryTournamentRepository([tournament]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
    })

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${squad.id}/recap-sheets`,
    )

    expect(response.status).toBe(200)
    expect(response.body.sheets).toEqual([])
    expect(response.body.withoutLane).toBe(0)
  })
})

describe('GET /v1/tournaments/:id/sweepers/:sessionId/recap-sheets (RPT-08)', () => {
  it('returns the sweeper games and the bonus pins as the handicap (SCR-09)', async () => {
    const { app, tournament, sweeper } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/sweepers/${sweeper.id}/recap-sheets`,
    )

    expect(response.status).toBe(200)
    expect(response.body.session).toMatchObject({ kind: 'sweeper', games: 4 })
    expect(response.body.sheets).toHaveLength(1)
    expect(response.body.sheets[0].handicap).toBe(12)
    expect(response.body.sheets[0].cross.same).toHaveLength(4)
  })

  it('answers 404 for a squad id under sweepers', async () => {
    const { app, tournament, squad } = setup()

    const response = await request(app).get(
      `/v1/tournaments/${tournament.id}/sweepers/${squad.id}/recap-sheets`,
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Sweeper not found' })
  })
})
