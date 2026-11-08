import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createPrismaSquadWriter } from '../features/squads/prismaWriter.ts'
import { createPrismaSweeperWriter } from '../features/sweepers/prismaWriter.ts'
import { createDatabaseClient, type PrismaClient } from './database.ts'
import { legacyRows, type LegacyRows } from '../test/legacyRows.ts'
import { createCapturedLogger } from '../test/logger.ts'
import { resetDatabase } from '../test/resetDatabase.ts'

describe('Prisma complete squad and sweeper (SQD-15 to SQD-18, D-190 to D-192)', () => {
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

  const squads = () => createPrismaSquadWriter(client, createCapturedLogger().logger)
  const sweepers = () => createPrismaSweeperWriter(client, createCapturedLogger().logger)

  const countOf = async (sql: string, ...values: unknown[]) => {
    const [row] = await client.$queryRawUnsafe<{ n: bigint }[]>(sql, ...values)
    return Number(row?.n ?? -1)
  }
  const isComplete = async (id: string) =>
    (await countOf('SELECT COUNT(*) AS n FROM Squads WHERE Id = ? AND Complete = 1', id)) === 1
  const scoresOf = (id: string, bowlerId: string) =>
    countOf(
      'SELECT COUNT(*) AS n FROM SquadScores WHERE SquadId = ? AND BowlerId = ?',
      id,
      bowlerId,
    )
  const zerosOf = (id: string) =>
    countOf('SELECT COUNT(*) AS n FROM SquadScores WHERE SquadId = ? AND Score = 0', id)

  /** A squad of three entered bowlers: none with scores, one with 2 of 6 games, one with all 6. */
  async function threeBowlers(tournamentId: string, id: string) {
    const division = await rows.division(tournamentId)
    const entered = []
    for (let n = 0; n < 3; n += 1) {
      const made = await rows.registration(division)
      await rows.squadEntry(made.registrationId, id)
      entered.push(made.bowlerId)
    }
    const [none, partial, full] = entered as [string, string, string]
    for (const game of [1, 2]) await rows.score(partial, id, game)
    for (const game of [1, 2, 3, 4, 5, 6]) await rows.score(full, id, game)
    return { none, partial, full }
  }

  it('sets the flag and saves a zero for each game of each no-show only (SQD-15, D-06, D-75, D-190)', async () => {
    const tournamentId = await rows.tournament()
    const id = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const { none, partial, full } = await threeBowlers(tournamentId, id)

    const outcome = await squads().complete(tournamentId, id)

    expect(outcome).toMatchObject({ completed: { id, complete: true }, noShowCount: 1 })
    expect(await isComplete(id)).toBe(true)
    // The tournament plays 6 games, so the no-show gets games 1 to 6 at 0.
    expect(await scoresOf(id, none)).toBe(6)
    expect(await zerosOf(id)).toBe(6)
    expect(await scoresOf(id, partial)).toBe(2)
    expect(await scoresOf(id, full)).toBe(6)
  })

  it('completes an empty squad and saves no zeros (D-192)', async () => {
    const tournamentId = await rows.tournament()
    const id = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')

    const outcome = await squads().complete(tournamentId, id)

    expect(outcome).toMatchObject({ completed: { complete: true }, noShowCount: 0 })
    expect(await zerosOf(id)).toBe(0)
  })

  it('counts a bowler with two registrations once, and zeroes only entries of this squad (SQD-15)', async () => {
    const tournamentId = await rows.tournament()
    const id = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const other = await rows.session(tournamentId, 'squad', '2026-10-24 13:00:00')
    const division = await rows.division(tournamentId)
    const { registrationId, bowlerId } = await rows.registration(division)
    await rows.squadEntry(registrationId, other)
    // Scores in another squad do not make this one a bowler's squad.
    await rows.score(bowlerId, other, 1)
    const made = await rows.registration(division)
    await rows.squadEntry(made.registrationId, id)

    const outcome = await squads().complete(tournamentId, id)

    expect(outcome).toMatchObject({ noShowCount: 1 })
    expect(await scoresOf(id, bowlerId)).toBe(0)
    expect(await scoresOf(id, made.bowlerId)).toBe(6)
    expect(await isComplete(other)).toBe(false)
  })

  it('refuses a squad that is already complete and saves nothing (SQD-18, D-192)', async () => {
    const tournamentId = await rows.tournament()
    const id = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    await threeBowlers(tournamentId, id)
    await squads().complete(tournamentId, id)
    const before = await zerosOf(id)

    const outcome = await squads().complete(tournamentId, id)

    expect(outcome).toEqual({ refused: { session: 'This squad is already complete' } })
    expect(await zerosOf(id)).toBe(before)
  })

  it('refuses a complete tournament and leaves the squad open (SQD-17, D-130)', async () => {
    const tournamentId = await rows.tournament({ completed: true })
    const id = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    await threeBowlers(tournamentId, id)

    const outcome = await squads().complete(tournamentId, id)

    expect(outcome).toEqual({
      refused: { tournament: 'This tournament is complete and cannot be changed' },
    })
    expect(await isComplete(id)).toBe(false)
    expect(await zerosOf(id)).toBe(0)
  })

  it('answers not found for an unknown tournament, another kind, and another tournament (D-192)', async () => {
    const tournamentId = await rows.tournament()
    const otherTournament = await rows.tournament()
    const squad = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const sweeper = await rows.session(tournamentId, 'sweeper', '2026-10-24 12:00:00')

    expect(await squads().complete(crypto.randomUUID(), squad)).toEqual({
      notFound: 'tournament',
    })
    expect(await squads().complete(tournamentId, sweeper)).toEqual({ notFound: 'session' })
    expect(await squads().complete(otherTournament, squad)).toEqual({ notFound: 'session' })
    expect(await isComplete(squad)).toBe(false)
  })

  it('refuses a squad row the list cannot read, and writes nothing (D-192)', async () => {
    const tournamentId = await rows.tournament()
    const made = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    // The list skips a row whose id is not a UUID (D-42).
    await client.$executeRawUnsafe("UPDATE Squads SET Id = 'not-a-uuid' WHERE Id = ?", made)

    const outcome = await squads().complete(tournamentId, 'not-a-uuid')

    expect(outcome).toEqual({
      refused: {
        session: 'This squad holds values the app cannot read, so it cannot be completed here.',
      },
    })
    expect(await isComplete('not-a-uuid')).toBe(false)
  })

  it('reports the counts the dialog shows (D-194)', async () => {
    const tournamentId = await rows.tournament()
    const id = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    await threeBowlers(tournamentId, id)

    expect(await squads().getCompleteInfo(tournamentId, id)).toEqual({
      entryCount: 3,
      noScoreCount: 1,
      partialCount: 1,
      games: 6,
    })
    expect(await squads().getCompleteInfo(crypto.randomUUID(), id)).toEqual({
      notFound: 'tournament',
    })
    expect(await squads().getCompleteInfo(tournamentId, crypto.randomUUID())).toEqual({
      notFound: 'session',
    })
  })

  describe('a sweeper (SQD-16, D-191)', () => {
    async function readableSweeper(tournamentId: string) {
      const id = await rows.session(tournamentId, 'sweeper', '2026-10-24 12:00:00')
      await client.$executeRawUnsafe(
        'UPDATE Squads SET SweeperEntryFee = 20, Games = 3, CashRatio = 4.5 WHERE Id = ?',
        id,
      )
      return id
    }

    it('sets the flag only, saves no scores, and returns the sweeper with its pins', async () => {
      const tournamentId = await rows.tournament()
      const division = await rows.division(tournamentId, { name: 'Open' })
      const id = await readableSweeper(tournamentId)
      await rows.sweeperPins(id, division, 10)
      const made = await rows.registration(division)
      await rows.squadEntry(made.registrationId, id)

      const outcome = await sweepers().complete(tournamentId, id)

      expect(outcome).toMatchObject({
        completed: {
          id,
          complete: true,
          bonusPins: [{ divisionId: division, divisionName: 'Open', bonusPinsPerGame: 10 }],
        },
        noShowCount: 0,
      })
      expect(await isComplete(id)).toBe(true)
      expect(await zerosOf(id)).toBe(0)
      expect(await scoresOf(id, made.bowlerId)).toBe(0)
    })

    it('refuses a repeat and a complete tournament (SQD-18, D-130)', async () => {
      const tournamentId = await rows.tournament()
      const id = await readableSweeper(tournamentId)
      await sweepers().complete(tournamentId, id)

      expect(await sweepers().complete(tournamentId, id)).toEqual({
        refused: { session: 'This sweeper is already complete' },
      })

      const frozen = await rows.tournament({ completed: true })
      const frozenId = await readableSweeper(frozen)
      expect(await sweepers().complete(frozen, frozenId)).toEqual({
        refused: { tournament: 'This tournament is complete and cannot be changed' },
      })
      expect(await isComplete(frozenId)).toBe(false)
    })

    it('refuses a sweeper the list cannot read (D-192)', async () => {
      const tournamentId = await rows.tournament()
      const id = await rows.session(tournamentId, 'sweeper', '2026-10-24 12:00:00')

      expect(await sweepers().complete(tournamentId, id)).toEqual({
        refused: {
          session: 'This sweeper holds values the app cannot read, so it cannot be completed here.',
        },
      })
      expect(await isComplete(id)).toBe(false)
    })

    it('reports only the entry count (D-194)', async () => {
      const tournamentId = await rows.tournament()
      const division = await rows.division(tournamentId)
      const id = await readableSweeper(tournamentId)
      const made = await rows.registration(division)
      await rows.squadEntry(made.registrationId, id)

      expect(await sweepers().getCompleteInfo(tournamentId, id)).toEqual({ entryCount: 1 })
    })
  })
})
