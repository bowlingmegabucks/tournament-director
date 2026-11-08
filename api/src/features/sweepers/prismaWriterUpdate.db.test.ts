import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows, type LegacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaSweeperRepository } from './prismaRepository.ts'
import { createPrismaSweeperWriter } from './prismaWriter.ts'

const go = { confirmWarnings: false }
const confirmed = { confirmWarnings: true }

describe('Prisma sweeper writer: update and edit-info (SQD-23 to SQD-26, SQD-29, D-180 to D-185)', () => {
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
      writer: createPrismaSweeperWriter(client, logger),
      repository: createPrismaSweeperRepository(client, logger),
    }
  }

  /** A sweeper at lanes 1 to 12, fee 20, 3 games, cash ratio 5, with 10 pins on the division. */
  async function sweeperIn(
    tournamentId: string,
    pins?: { divisionId: string; pins: number | null },
  ) {
    const id = await rows.session(tournamentId, 'sweeper', '2026-10-23 19:00:00')
    await client.$executeRawUnsafe(
      'UPDATE Squads SET SweeperEntryFee = 20, Games = 3, CashRatio = 5 WHERE Id = ?',
      id,
    )
    if (pins) await rows.sweeperPins(id, pins.divisionId, pins.pins)
    return id
  }

  async function stored(id: string) {
    const [row] = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT StartingLane, NumberOfLanes, MaxPerPair, \`Complete\`, SquadEntryFee, SweeperEntryFee,
              Games, CashRatio FROM Squads WHERE Id = ?`,
      id,
    )
    return row
  }

  const pinRows = (id: string) =>
    client.$queryRawUnsafe<{ DivisionId: string; BonusPinsPerGame: number | null }[]>(
      'SELECT DivisionId, BonusPinsPerGame FROM SweeperDivision WHERE SweeperId = ? ORDER BY DivisionId',
      id,
    )

  async function bowlerOn(sweeperId: string, tournamentId: string, position: string) {
    const divisionId = await rows.division(tournamentId, { name: `D${position}` })
    const { registrationId, bowlerId } = await rows.registration(divisionId)
    await rows.squadEntry(registrationId, sweeperId, position)
    return bowlerId
  }

  it('writes the sweeper columns sent and leaves the rest and the squad columns alone (SQD-23)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await rows.tournament()
    const id = await sweeperIn(tournamentId)

    const outcome = await writer.update(
      tournamentId,
      id,
      { games: 4, entryFee: 25, cashRatio: 3.5, maxPerPair: 2 },
      go,
    )

    expect(outcome).toMatchObject({
      updated: { id, games: 4, entryFee: 25, cashRatio: 3.5, maxPerPair: 2 },
      changed: ['games', 'entryFee', 'cashRatio', 'maxPerPair'],
    })
    const row = await stored(id)
    expect(row).toMatchObject({ Games: 4, MaxPerPair: 2, StartingLane: 1, NumberOfLanes: 12 })
    expect(Number(row?.['SweeperEntryFee'])).toBe(25)
    expect(Number(row?.['CashRatio'])).toBe(3.5)
    expect(row?.['SquadEntryFee']).toBeNull()
    expect(row?.['Complete']).toBeFalsy()
    expect((await repository.listByTournament(tournamentId))[0]).toMatchObject({
      games: 4,
      entryFee: 25,
    })
  })

  it('adds, changes, and removes pin rows, leaving a division not sent alone (SQD-29, D-176, D-184)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await rows.tournament()
    const open = await rows.division(tournamentId, { name: 'Open', number: 1 })
    const women = await rows.division(tournamentId, { name: 'Women', number: 2 })
    const senior = await rows.division(tournamentId, { name: 'Senior', number: 3 })
    const id = await sweeperIn(tournamentId, { divisionId: open, pins: 10 })
    await rows.sweeperPins(id, senior, null)

    const outcome = await writer.update(
      tournamentId,
      id,
      { bonusPins: { [open]: 8, [women]: 6, [senior]: 0 } },
      go,
    )

    expect(outcome).toMatchObject({
      updated: {
        bonusPins: [
          { divisionId: open, divisionName: 'Open', bonusPinsPerGame: 8 },
          { divisionId: women, divisionName: 'Women', bonusPinsPerGame: 6 },
        ],
      },
      changed: ['bonusPins'],
    })
    // A NULL row already counts as 0 (D-45), so sending 0 for it changes nothing and leaves it.
    expect(await pinRows(id)).toEqual(
      [
        { DivisionId: open, BonusPinsPerGame: 8 },
        { DivisionId: women, BonusPinsPerGame: 6 },
        { DivisionId: senior, BonusPinsPerGame: null },
      ].sort((a, b) => a.DivisionId.localeCompare(b.DivisionId)),
    )

    await writer.update(tournamentId, id, { bonusPins: { [open]: 0 } }, go)
    expect((await repository.listByTournament(tournamentId))[0]?.bonusPins).toEqual([
      { divisionId: women, divisionName: 'Women', bonusPinsPerGame: 6 },
    ])
  })

  it('overwrites a stored NULL pin row instead of failing on the key (SQD-29)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const open = await rows.division(tournamentId, { name: 'Open' })
    const id = await sweeperIn(tournamentId, { divisionId: open, pins: null })

    await writer.update(tournamentId, id, { bonusPins: { [open]: 7 } }, go)

    expect(await pinRows(id)).toEqual([{ DivisionId: open, BonusPinsPerGame: 7 }])
  })

  it('refuses a division of another tournament and saves nothing at all (SQD-29, D-177)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const otherId = await rows.tournament()
    const foreign = await rows.division(otherId)
    const id = await sweeperIn(tournamentId)

    const outcome = await writer.update(
      tournamentId,
      id,
      { games: 4, bonusPins: { [foreign]: 5 } },
      go,
    )

    expect(outcome).toEqual({
      refused: { bonusPins: 'A division no longer exists. Reload the page' },
    })
    expect((await stored(id))?.['Games']).toBe(3)
    expect(await pinRows(id)).toEqual([])
  })

  it('refuses a division deleted after the form loaded, saving nothing (SQD-29, D-177)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const open = await rows.division(tournamentId, { name: 'Open' })
    const id = await sweeperIn(tournamentId)
    // A division deleted after the form loaded: the plan refuses it, and nothing is written.
    await client.$executeRawUnsafe('DELETE FROM Divisions WHERE Id = ?', open)

    const outcome = await writer.update(
      tournamentId,
      id,
      { games: 5, bonusPins: { [open]: 5 } },
      go,
    )

    expect(outcome).toEqual({
      refused: { bonusPins: 'A division no longer exists. Reload the page' },
    })
    expect((await stored(id))?.['Games']).toBe(3)
    expect(await pinRows(id)).toEqual([])
  })

  it('answers not found for an unknown tournament, an unknown sweeper, a squad, and another tournament (SQD-23)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const otherId = await rows.tournament()
    const id = await sweeperIn(tournamentId)
    const squadId = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')

    expect(await writer.update(crypto.randomUUID(), id, {}, go)).toEqual({ notFound: 'tournament' })
    expect(await writer.update(tournamentId, crypto.randomUUID(), {}, go)).toEqual({
      notFound: 'session',
    })
    expect(await writer.update(tournamentId, squadId, {}, go)).toEqual({ notFound: 'session' })
    expect(await writer.update(otherId, id, {}, go)).toEqual({ notFound: 'session' })
  })

  it('refuses a complete tournament and a complete sweeper, saving nothing (SQD-24, D-181)', async () => {
    const { writer } = setup()
    const frozen = await rows.tournament({ completed: true })
    const a = await sweeperIn(frozen)
    const tournamentId = await rows.tournament()
    const b = await sweeperIn(tournamentId)
    await client.$executeRawUnsafe('UPDATE Squads SET `Complete` = 1 WHERE Id = ?', b)

    expect(await writer.update(frozen, a, { games: 4 }, confirmed)).toEqual({
      refused: { tournament: 'This tournament is complete and cannot be changed' },
    })
    expect(await writer.update(tournamentId, b, { games: 4 }, confirmed)).toEqual({
      refused: { session: 'This sweeper is complete and cannot be changed' },
    })
    expect((await stored(a))?.['Games']).toBe(3)
    expect((await stored(b))?.['Games']).toBe(3)
  })

  it('refuses games once this sweeper has a score, but not for a score in another session (SQD-24, D-180)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await sweeperIn(tournamentId)
    const other = await sweeperIn(tournamentId)
    const bowler = await bowlerOn(other, tournamentId, '1A')
    await rows.score(bowler, other)

    expect(await writer.update(tournamentId, id, { games: 4 }, go)).toMatchObject({
      changed: ['games'],
    })
    expect(await writer.update(tournamentId, other, { games: 4 }, confirmed)).toEqual({
      refused: { games: 'Scores are saved, so the number of games cannot change.' },
    })
  })

  it('warns about pins and the cash ratio with scores, then saves when confirmed (SQD-25)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const open = await rows.division(tournamentId, { name: 'Open' })
    const id = await sweeperIn(tournamentId, { divisionId: open, pins: 10 })
    const bowler = await bowlerOn(id, tournamentId, '1A')
    await rows.score(bowler, id)

    const warned = await writer.update(tournamentId, id, { bonusPins: { [open]: 8 } }, go)

    expect(warned).toEqual({
      warnings: [
        {
          field: `bonusPins.${open}`,
          message: 'Open: scores are saved. Posted results change at once.',
        },
      ],
    })
    expect(await pinRows(id)).toEqual([{ DivisionId: open, BonusPinsPerGame: 10 }])
    await writer.update(tournamentId, id, { bonusPins: { [open]: 8 } }, confirmed)
    expect(await pinRows(id)).toEqual([{ DivisionId: open, BonusPinsPerGame: 8 }])
  })

  it('refuses lanes that strand a bowler from the saved positions (D-182)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await sweeperIn(tournamentId)
    await bowlerOn(id, tournamentId, '11A')

    expect(await writer.update(tournamentId, id, { numberOfLanes: 10 }, confirmed)).toEqual({
      refused: { numberOfLanes: 'Lane 11 has a bowler assigned. Move them first.' },
    })
    expect(await writer.update(tournamentId, id, { startingLane: 3 }, go)).toMatchObject({
      warnings: [{ field: 'startingLane' }],
    })
  })

  it('reads the entries, scores, and assigned lanes of this sweeper only (SQD-26)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await sweeperIn(tournamentId)
    await bowlerOn(id, tournamentId, '3A')
    await bowlerOn(id, tournamentId, '4C')
    await bowlerOn(id, tournamentId, '')

    expect(await writer.getEditInfo(tournamentId, id)).toEqual({
      entryCount: 3,
      assignmentCount: 2,
      hasScores: false,
      lowestAssignedLane: 3,
      highestAssignedLane: 4,
      fullestPair: 2,
    })
    expect(await writer.getEditInfo(crypto.randomUUID(), id)).toEqual({ notFound: 'tournament' })
    expect(await writer.getEditInfo(tournamentId, crypto.randomUUID())).toEqual({
      notFound: 'session',
    })
  })
})
