import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { completeMessage } from '../../shared/sessionCreate.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { unknownDivisionMessage } from './createPlan.ts'
import type { NewSweeper } from './createRequest.ts'
import { createPrismaSweeperRepository } from './prismaRepository.ts'
import { createPrismaSweeperWriter } from './prismaWriter.ts'

const base: NewSweeper = {
  date: '2026-10-24T18:30:00',
  startingLane: 3,
  numberOfLanes: 20,
  maxPerPair: 4,
  entryFee: 20,
  games: 3,
  cashRatio: 5,
  bonusPins: {},
}

describe('Prisma sweeper writer', () => {
  let client: PrismaClient

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(client)
  })

  function setup() {
    const captured = createCapturedLogger()
    return {
      writer: createPrismaSweeperWriter(client, captured.logger),
      repository: createPrismaSweeperRepository(client, captured.logger),
    }
  }

  /** A $50 fee, 6 games, from Oct 23 to Oct 25. */
  async function insertTournament(
    options: { completed?: boolean; start?: string } = {},
  ): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, ?, ?, '2026-10-25', 50, 6, 7.0, 5.0, 'Lanes', ?)`,
      id,
      `Tournament ${id}`,
      options.start ?? '2026-10-23',
      options.completed ? 1 : 0,
    )
    return id
  }

  async function insertDivision(tournamentId: string, name: string, number: number) {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Divisions (Id, Name, Number, TournamentId) VALUES (?, ?, ?, ?)`,
      id,
      name,
      number,
      tournamentId,
    )
    return id
  }

  const countSweepers = async (tournamentId: string) =>
    (await client.squad.count({ where: { tournamentId, squadType: 1 } })) as number
  const countPins = async () => (await client.sweeperDivision.count()) as number

  it('stores every column of an open sweeper (SQD-10 to SQD-12)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    const outcome = await writer.create(tournamentId, base)

    if (!('created' in outcome)) throw new Error('expected a created sweeper')
    const [row] = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, \`Complete\`,
              SquadEntryFee, FinalsRatio, CashRatio, SweeperEntryFee, Games
         FROM Squads WHERE Id = ?`,
      outcome.created.id,
    )
    expect(row).toMatchObject({
      TournamentId: tournamentId,
      SquadType: 1,
      MaxPerPair: 4,
      StartingLane: 3,
      NumberOfLanes: 20,
      SquadEntryFee: null,
      FinalsRatio: null,
      Games: 3,
    })
    expect(Number(row?.['Complete'])).toBe(0)
    expect(Number(row?.['SweeperEntryFee'])).toBe(20)
    expect(Number(row?.['CashRatio'])).toBe(5)
    expect((row?.['Date'] as Date).toISOString().slice(0, 19)).toBe('2026-10-24T18:30:00')
  })

  it('stores a pin row for each division with pins other than 0, and none for 0 (SQD-13, D-176)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const open = await insertDivision(tournamentId, 'Open', 1)
    const women = await insertDivision(tournamentId, 'Women', 2)
    const seniors = await insertDivision(tournamentId, 'Seniors', 3)

    const outcome = await writer.create(tournamentId, {
      ...base,
      bonusPins: { [open]: 10, [women]: 6, [seniors]: 0 },
    })

    if (!('created' in outcome)) throw new Error('expected a created sweeper')
    const rows = await client.$queryRawUnsafe<{ DivisionId: string; Pins: number }[]>(
      `SELECT DivisionId, BonusPinsPerGame AS Pins FROM SweeperDivision WHERE SweeperId = ?
        ORDER BY BonusPinsPerGame DESC`,
      outcome.created.id,
    )
    expect(rows.map((row) => [row.DivisionId, Number(row.Pins)])).toEqual([
      [open, 10],
      [women, 6],
    ])
  })

  it('stores what the list then reads back, pins in division order (SQD-22, D-45)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await insertTournament()
    // Created out of order on purpose.
    const women = await insertDivision(tournamentId, 'Women', 2)
    const open = await insertDivision(tournamentId, 'Open', 1)

    const outcome = await writer.create(tournamentId, {
      ...base,
      bonusPins: { [women]: 6, [open]: 10 },
    })

    if (!('created' in outcome)) throw new Error('expected a created sweeper')
    expect(outcome.created.bonusPins.map((pins) => pins.divisionName)).toEqual(['Open', 'Women'])
    expect(await repository.listByTournament(tournamentId)).toEqual([outcome.created])
  })

  it('stores a sweeper with no divisions and no pin rows (D-177)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await insertTournament()

    const outcome = await writer.create(tournamentId, base)

    expect('created' in outcome).toBe(true)
    expect(await countPins()).toBe(0)
    expect(await repository.listByTournament(tournamentId)).toMatchObject([{ bonusPins: [] }])
  })

  it('rolls the sweeper back when its pins fail to save (D-178)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const open = await insertDivision(tournamentId, 'Open', 1)

    // Past the INT column, so the pin insert fails after the sweeper row went in.
    await expect(
      writer.create(tournamentId, { ...base, bonusPins: { [open]: 2 ** 40 } }),
    ).rejects.toThrow()

    expect(await countSweepers(tournamentId)).toBe(0)
    expect(await countPins()).toBe(0)
  })

  it('refuses a division of another tournament and stores nothing (D-177)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const other = await insertTournament()
    const foreign = await insertDivision(other, 'Open', 1)

    const outcome = await writer.create(tournamentId, { ...base, bonusPins: { [foreign]: 10 } })

    expect(outcome).toEqual({ refused: { bonusPins: unknownDivisionMessage } })
    expect(await countSweepers(tournamentId)).toBe(0)
    expect(await countPins()).toBe(0)
  })

  it('refuses a division that does not exist, even with 0 pins (D-177)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    const outcome = await writer.create(tournamentId, {
      ...base,
      bonusPins: { [crypto.randomUUID()]: 0 },
    })

    expect(outcome).toEqual({ refused: { bonusPins: unknownDivisionMessage } })
  })

  it('adds the sweeper to the tournament in the URL and no other (SQD-10)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const other = await insertTournament()

    await writer.create(tournamentId, base)

    expect(await countSweepers(tournamentId)).toBe(1)
    expect(await countSweepers(other)).toBe(0)
  })

  it('answers not found for an unknown tournament and stores nothing (SQD-10)', async () => {
    const { writer } = setup()

    const outcome = await writer.create(crypto.randomUUID(), base)

    expect(outcome).toEqual({ notFound: true })
    expect(await client.squad.count()).toBe(0)
  })

  it('refuses a complete tournament and stores nothing (D-171)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament({ completed: true })

    const outcome = await writer.create(tournamentId, base)

    expect(outcome).toEqual({ refused: { tournament: completeMessage } })
    expect(await countSweepers(tournamentId)).toBe(0)
  })

  it.each([
    ['2026-10-22T23:59:00', 'Sweeper date must be after tournament start'],
    ['2026-10-26T00:00:00', 'Sweeper date must be before tournament end'],
  ])('refuses %s, outside the tournament dates (SQD-10)', async (date, message) => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    const outcome = await writer.create(tournamentId, { ...base, date })

    expect(outcome).toEqual({ refused: { date: message } })
    expect(await countSweepers(tournamentId)).toBe(0)
  })

  it.each(['2026-10-23T00:00:00', '2026-10-25T23:59:00'])(
    'accepts %s, the first and last minute of the tournament (SQD-10)',
    async (date) => {
      const { writer } = setup()
      const tournamentId = await insertTournament()

      expect('created' in (await writer.create(tournamentId, { ...base, date }))).toBe(true)
    },
  )

  it('counts from the start of the start day when legacy stored a time of day (SQD-10)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament({ start: '2026-10-23 14:00:00' })

    const outcome = await writer.create(tournamentId, { ...base, date: '2026-10-23T09:00:00' })

    expect('created' in outcome).toBe(true)
  })

  it('leaves squads alone: a squad is not read as a sweeper (SQD-10)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await insertTournament()
    await client.$executeRawUnsafe(
      `INSERT INTO Squads (Id, TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, \`Complete\`)
       VALUES (UUID(), ?, 0, '2026-10-24 09:00:00', 4, 1, 24, 0)`,
      tournamentId,
    )

    await writer.create(tournamentId, base)

    expect(await repository.listByTournament(tournamentId)).toHaveLength(1)
    expect(await client.squad.count({ where: { tournamentId } })).toBe(2)
  })

  it('allows a second sweeper at the same time on the same lanes (D-169)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    await writer.create(tournamentId, base)
    await writer.create(tournamentId, base)

    expect(await countSweepers(tournamentId)).toBe(2)
  })
})
