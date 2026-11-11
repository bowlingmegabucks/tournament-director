import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { legacyRows, type LegacyRows } from '../../test/legacyRows.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createPrismaDivisionRepository } from '../divisions/prismaRepository.ts'
import { createPrismaDnfStore } from '../dnf/prismaStore.ts'
import { createPrismaLaneRepository } from '../lanes/prismaRepository.ts'
import { createPrismaScoreRepository } from '../scores/prismaRepository.ts'
import { createPrismaSquadRepository } from '../squads/prismaRepository.ts'
import { createPrismaSweeperRepository } from '../sweepers/prismaRepository.ts'
import { createPrismaTournamentRepository } from '../tournaments/prismaRepository.ts'
import { liveResultsSchema } from './types.ts'

// The TV feed reads the same tables as the other results routes, for every session at once, plus
// the DNF table. This proves the pieces fit on a real database (RES-47, RES-55).
describe('live results on a real database', () => {
  let client: PrismaClient
  let rows: LegacyRows

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
    rows = legacyRows(client)
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(client)
  })

  const score = (bowlerId: string, sessionId: string, game: number, pins: number) =>
    client.$executeRawUnsafe(
      'INSERT INTO SquadScores (BowlerId, SquadId, Game, Score) VALUES (?, ?, ?, ?)',
      bowlerId,
      sessionId,
      game,
      pins,
    )

  function appOnDatabase() {
    const { logger } = createCapturedLogger()
    return createTestApp({
      logger,
      tournaments: createPrismaTournamentRepository(client, logger),
      divisions: createPrismaDivisionRepository(client, logger),
      squads: createPrismaSquadRepository(client, logger),
      sweepers: createPrismaSweeperRepository(client, logger),
      lanes: createPrismaLaneRepository(client, logger),
      scores: createPrismaScoreRepository(client, logger),
      dnfStore: createPrismaDnfStore(client, logger),
    })
  }

  async function world() {
    const tournamentId = await rows.tournament()
    const divisionId = await rows.division(tournamentId)
    const morning = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const afternoon = await rows.session(tournamentId, 'squad', '2026-10-24 13:00:00')
    const sweeper = await rows.session(tournamentId, 'sweeper', '2026-10-24 18:00:00')
    await client.$executeRawUnsafe(
      'UPDATE Squads SET Games = 2, CashRatio = 2.0, SweeperEntryFee = 25 WHERE Id = ?',
      sweeper,
    )
    const walked = await rows.registration(divisionId)
    const steady = await rows.registration(divisionId)
    for (const entry of [walked, steady]) await rows.squadEntry(entry.registrationId, morning)
    await rows.squadEntry(steady.registrationId, sweeper)
    await score(walked.bowlerId, morning, 1, 210)
    await score(walked.bowlerId, morning, 2, 210)
    for (const game of [1, 2, 3]) await score(steady.bowlerId, morning, game, 200)
    await score(steady.bowlerId, sweeper, 1, 220)
    return { tournamentId, morning, afternoon, sweeper, walked, steady }
  }

  it('lists the squads with scores, then the sweeper, through the last full game (RES-47, RES-40)', async () => {
    const { tournamentId, morning, sweeper } = await world()

    const response = await request(appOnDatabase()).get(
      `/v1/tournaments/${tournamentId}/live-results`,
    )

    expect(response.status).toBe(200)
    expect(liveResultsSchema.safeParse(response.body).success).toBe(true)
    // The afternoon squad has no scores, so it is left out.
    expect(
      response.body.sessions.map((s: { kind: string; results: { session: { id: string } } }) => [
        s.kind,
        s.results.session.id,
      ]),
    ).toEqual([
      ['squad', morning],
      ['sweeper', sweeper],
    ])
    expect(response.body.sessions[0].results.divisions[0].throughGame).toBe(2)
    expect(response.body.superSweeper).toBeNull()
  })

  it('stops waiting for a flagged bowler and tags them (RES-55, RES-56, D-248)', async () => {
    const { tournamentId, morning, walked } = await world()
    await client.sessionDnf.create({
      data: { sessionId: morning, registrationId: walked.registrationId },
    })

    const response = await request(appOnDatabase()).get(
      `/v1/tournaments/${tournamentId}/live-results`,
    )

    const division = response.body.sessions[0].results.divisions[0]
    expect(division.throughGame).toBe(3)
    expect(
      division.rows
        .filter((row: { dnf: boolean }) => row.dnf)
        .map((row: { registrationId: string }) => row.registrationId),
    ).toEqual([walked.registrationId])
  })
})
