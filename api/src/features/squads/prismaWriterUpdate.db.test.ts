import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows, type LegacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaSquadRepository } from './prismaRepository.ts'
import { createPrismaSquadWriter } from './prismaWriter.ts'

const go = { confirmWarnings: false }
const confirmed = { confirmWarnings: true }

describe('Prisma squad writer: update and edit-info (SQD-23 to SQD-26, D-180 to D-185)', () => {
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

  function setup() {
    const { logger } = createCapturedLogger()
    return {
      writer: createPrismaSquadWriter(client, logger),
      repository: createPrismaSquadRepository(client, logger),
    }
  }

  /** A squad at lanes 1 to 12, 4 per pair, with the fee and ratios set (fee 60). */
  async function squadIn(tournamentId: string) {
    const id = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    await client.$executeRawUnsafe(
      'UPDATE Squads SET SquadEntryFee = 60, FinalsRatio = 5.5 WHERE Id = ?',
      id,
    )
    return id
  }

  async function stored(squadId: string) {
    const [row] = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT Date, StartingLane, NumberOfLanes, MaxPerPair, \`Complete\`, SquadEntryFee,
              FinalsRatio, CashRatio, SweeperEntryFee, Games
         FROM Squads WHERE Id = ?`,
      squadId,
    )
    return row
  }

  async function bowlerOn(squadId: string, tournamentId: string, position: string) {
    const divisionId = await rows.division(tournamentId, { name: `D${position}` })
    const { registrationId, bowlerId } = await rows.registration(divisionId)
    await rows.squadEntry(registrationId, squadId, position)
    return bowlerId
  }

  it('writes only the columns sent and leaves the rest alone (SQD-23)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await rows.tournament()
    const id = await squadIn(tournamentId)

    const outcome = await writer.update(
      tournamentId,
      id,
      { date: '2026-10-24T13:00:00', maxPerPair: 3, cashRatio: 2.5 },
      go,
    )

    expect(outcome).toMatchObject({
      updated: { id, date: '2026-10-24T13:00:00', maxPerPair: 3, cashRatio: 2.5, entryFee: 60 },
      changed: ['date', 'maxPerPair', 'cashRatio'],
    })
    const row = await stored(id)
    expect(row).toMatchObject({ MaxPerPair: 3, StartingLane: 1, NumberOfLanes: 12 })
    expect(Number(row?.['SquadEntryFee'])).toBe(60)
    expect(Number(row?.['CashRatio'])).toBe(2.5)
    expect(new Date(row?.['Date'] as Date).toISOString()).toBe('2026-10-24T13:00:00.000Z')
    expect(row?.['Complete']).toBeFalsy()
    expect((await repository.listByTournament(tournamentId))[0]).toMatchObject({
      date: '2026-10-24T13:00:00',
      cashRatio: 2.5,
    })
  })

  it('clears an override to NULL so the tournament value applies (D-183)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await squadIn(tournamentId)

    const outcome = await writer.update(tournamentId, id, { entryFee: null, finalsRatio: null }, go)

    expect(outcome).toMatchObject({
      updated: {
        entryFee: 50,
        entryFeeOverridden: false,
        finalsRatio: 7,
        finalsRatioOverridden: false,
      },
    })
    const row = await stored(id)
    expect(row?.['SquadEntryFee']).toBeNull()
    expect(row?.['FinalsRatio']).toBeNull()
  })

  it('writes nothing for a body that changes nothing (SQD-23)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await squadIn(tournamentId)
    const before = await stored(id)

    const outcome = await writer.update(tournamentId, id, { maxPerPair: 4, entryFee: 60 }, go)

    expect(outcome).toMatchObject({ changed: [] })
    expect(await stored(id)).toEqual(before)
  })

  it('answers not found for an unknown tournament, an unknown squad, a sweeper, and another tournament (SQD-23)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const otherId = await rows.tournament()
    const id = await squadIn(tournamentId)
    const sweeperId = await rows.session(tournamentId, 'sweeper', '2026-10-24 18:00:00')

    expect(await writer.update(crypto.randomUUID(), id, {}, go)).toEqual({ notFound: 'tournament' })
    expect(await writer.update(tournamentId, crypto.randomUUID(), {}, go)).toEqual({
      notFound: 'session',
    })
    expect(await writer.update(tournamentId, sweeperId, {}, go)).toEqual({ notFound: 'session' })
    expect(await writer.update(otherId, id, {}, go)).toEqual({ notFound: 'session' })
  })

  it('refuses a complete tournament and a complete squad, and saves nothing (SQD-24, D-181)', async () => {
    const { writer } = setup()
    const frozenTournament = await rows.tournament({ completed: true })
    const a = await squadIn(frozenTournament)
    const tournamentId = await rows.tournament()
    const b = await squadIn(tournamentId)
    await client.$executeRawUnsafe('UPDATE Squads SET `Complete` = 1 WHERE Id = ?', b)

    expect(await writer.update(frozenTournament, a, { entryFee: 70 }, confirmed)).toEqual({
      refused: { tournament: 'This tournament is complete and cannot be changed' },
    })
    expect(await writer.update(tournamentId, b, { entryFee: 70 }, confirmed)).toEqual({
      refused: { session: 'This squad is complete and cannot be changed' },
    })
    expect(Number((await stored(a))?.['SquadEntryFee'])).toBe(60)
    expect(Number((await stored(b))?.['SquadEntryFee'])).toBe(60)
  })

  it('refuses a date outside the tournament dates (SQD-03, SQD-24)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament({ start: '2026-10-23', end: '2026-10-25' })
    const id = await squadIn(tournamentId)

    expect(await writer.update(tournamentId, id, { date: '2026-10-26T09:00:00' }, go)).toEqual({
      refused: { date: 'Squad date must be before tournament end' },
    })
  })

  it('refuses lanes and max per pair that strand a bowler, from the saved positions (D-182)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await squadIn(tournamentId)
    await bowlerOn(id, tournamentId, '11A')
    await bowlerOn(id, tournamentId, '11B')
    await bowlerOn(id, tournamentId, '12C')
    await bowlerOn(id, tournamentId, '1F')

    expect(await writer.update(tournamentId, id, { numberOfLanes: 10 }, confirmed)).toEqual({
      refused: { numberOfLanes: 'Lane 12 has a bowler assigned. Move them first.' },
    })
    expect(await writer.update(tournamentId, id, { maxPerPair: 2 }, confirmed)).toEqual({
      refused: { maxPerPair: 'Pair 11-12 holds 3 bowlers. Move them first.' },
    })
    expect(await writer.update(tournamentId, id, { numberOfLanes: 14 }, go)).toMatchObject({
      warnings: [{ field: 'numberOfLanes' }],
    })
  })

  it('warns with the entry count, then saves when confirmed (SQD-25, D-180)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await squadIn(tournamentId)
    await bowlerOn(id, tournamentId, '1A')

    const warned = await writer.update(tournamentId, id, { entryFee: 75 }, go)

    expect(warned).toEqual({
      warnings: [
        {
          field: 'entryFee',
          message: '1 bowler is entered. They keep what they paid. New entries pay the new fee.',
        },
      ],
    })
    expect(Number((await stored(id))?.['SquadEntryFee'])).toBe(60)
    expect(await writer.update(tournamentId, id, { entryFee: 75 }, confirmed)).toMatchObject({
      changed: ['entryFee'],
    })
    expect(Number((await stored(id))?.['SquadEntryFee'])).toBe(75)
  })

  it('warns about the ratios only with a score in this squad, not in another (SQD-25, D-180)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await squadIn(tournamentId)
    const other = await squadIn(tournamentId)
    const bowlerId = await bowlerOn(other, tournamentId, '1A')
    await rows.score(bowlerId, other)

    expect(await writer.update(tournamentId, id, { cashRatio: 3 }, go)).toMatchObject({
      changed: ['cashRatio'],
    })
    expect(await writer.update(tournamentId, other, { cashRatio: 3 }, go)).toMatchObject({
      warnings: [
        { field: 'cashRatio', message: 'Scores are saved. Posted results change at once.' },
      ],
    })
  })

  it('reads the entries, scores, and assigned lanes of this squad only (SQD-26)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await squadIn(tournamentId)
    const other = await squadIn(tournamentId)
    await bowlerOn(id, tournamentId, '3A')
    await bowlerOn(id, tournamentId, '3B')
    await bowlerOn(id, tournamentId, '8C')
    await bowlerOn(id, tournamentId, '')
    const scored = await bowlerOn(other, tournamentId, '5A')
    await rows.score(scored, other)

    expect(await writer.getEditInfo(tournamentId, id)).toEqual({
      entryCount: 4,
      assignmentCount: 3,
      hasScores: false,
      lowestAssignedLane: 3,
      highestAssignedLane: 8,
      fullestPair: 2,
    })
    expect(await writer.getEditInfo(tournamentId, other)).toMatchObject({
      entryCount: 1,
      hasScores: true,
    })
    expect(await writer.getEditInfo(crypto.randomUUID(), id)).toEqual({ notFound: 'tournament' })
    expect(await writer.getEditInfo(tournamentId, crypto.randomUUID())).toEqual({
      notFound: 'session',
    })
  })
})
