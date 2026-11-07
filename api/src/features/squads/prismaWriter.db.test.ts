import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { afterEndMessage, beforeStartMessage, completeMessage } from './createPlan.ts'
import type { NewSquad } from './createRequest.ts'
import { createPrismaSquadRepository } from './prismaRepository.ts'
import { createPrismaSquadWriter } from './prismaWriter.ts'

const full: NewSquad = {
  date: '2026-10-24T09:30:00',
  startingLane: 3,
  numberOfLanes: 20,
  maxPerPair: 4,
  entryFee: 60,
  finalsRatio: 5.5,
  cashRatio: 3,
}
const bare: NewSquad = { ...full, entryFee: null, finalsRatio: null, cashRatio: null }

describe('Prisma squad writer', () => {
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
      writer: createPrismaSquadWriter(client, captured.logger),
      repository: createPrismaSquadRepository(client, captured.logger),
    }
  }

  /** A $50 fee, 6 games, finals ratio 7.0, cash ratio 5.0, from Oct 23 to Oct 25. */
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

  const countSquads = async (tournamentId: string) =>
    (await client.squad.count({ where: { tournamentId } })) as number

  it('stores every column of an open squad, the override columns as sent (SQD-02, SQD-04 to SQD-08)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    const outcome = await writer.create(tournamentId, full)

    if (!('created' in outcome)) throw new Error('expected a created squad')
    const [row] = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, \`Complete\`,
              SquadEntryFee, FinalsRatio, CashRatio, SweeperEntryFee, Games
         FROM Squads WHERE Id = ?`,
      outcome.created.id,
    )
    expect(row).toMatchObject({
      TournamentId: tournamentId,
      SquadType: 0,
      MaxPerPair: 4,
      StartingLane: 3,
      NumberOfLanes: 20,
      SweeperEntryFee: null,
      Games: null,
    })
    expect(Number(row?.['Complete'])).toBe(0)
    expect(Number(row?.['SquadEntryFee'])).toBe(60)
    expect(Number(row?.['FinalsRatio'])).toBe(5.5)
    expect(Number(row?.['CashRatio'])).toBe(3)
    expect((row?.['Date'] as Date).toISOString().slice(0, 19)).toBe('2026-10-24T09:30:00')
  })

  it('stores NULL for a blank fee and ratios, so the squad uses the tournament values (TRN-12, D-170)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    const outcome = await writer.create(tournamentId, bare)

    if (!('created' in outcome)) throw new Error('expected a created squad')
    const [row] = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT SquadEntryFee, FinalsRatio, CashRatio FROM Squads WHERE Id = ?`,
      outcome.created.id,
    )
    expect(row).toEqual({ SquadEntryFee: null, FinalsRatio: null, CashRatio: null })
    expect(outcome.created).toMatchObject({
      entryFee: 50,
      entryFeeOverridden: false,
      finalsRatio: 7,
      finalsRatioOverridden: false,
      cashRatio: 5,
      cashRatioOverridden: false,
      games: 6,
    })
  })

  it('stores a fee of 0 as set (SQD-08)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await insertTournament()

    await writer.create(tournamentId, { ...bare, entryFee: 0 })

    expect(await repository.listByTournament(tournamentId)).toMatchObject([
      { entryFee: 0, entryFeeOverridden: true },
    ])
  })

  it('stores what the list then reads back (SQD-21, D-169)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await insertTournament()

    const outcome = await writer.create(tournamentId, full)

    if (!('created' in outcome)) throw new Error('expected a created squad')
    expect(await repository.listByTournament(tournamentId)).toEqual([outcome.created])
  })

  it('adds the squad to the tournament in the URL and no other (SQD-01)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const other = await insertTournament()

    await writer.create(tournamentId, full)

    expect(await countSquads(tournamentId)).toBe(1)
    expect(await countSquads(other)).toBe(0)
  })

  it('answers not found for an unknown tournament and stores nothing (SQD-01)', async () => {
    const { writer } = setup()

    const outcome = await writer.create(crypto.randomUUID(), full)

    expect(outcome).toEqual({ notFound: true })
    expect(await client.squad.count()).toBe(0)
  })

  it('refuses a complete tournament and stores nothing (D-171)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament({ completed: true })

    const outcome = await writer.create(tournamentId, full)

    expect(outcome).toEqual({ refused: { tournament: completeMessage } })
    expect(await countSquads(tournamentId)).toBe(0)
  })

  it.each([
    ['2026-10-22T23:59:00', beforeStartMessage],
    ['2026-10-26T00:00:00', afterEndMessage],
  ])('refuses %s, outside the tournament dates (SQD-03)', async (date, message) => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    const outcome = await writer.create(tournamentId, { ...full, date })

    expect(outcome).toEqual({ refused: { date: message } })
    expect(await countSquads(tournamentId)).toBe(0)
  })

  it.each(['2026-10-23T00:00:00', '2026-10-25T23:59:00'])(
    'accepts %s, the first and last minute of the tournament (SQD-03)',
    async (date) => {
      const { writer } = setup()
      const tournamentId = await insertTournament()

      const outcome = await writer.create(tournamentId, { ...full, date })

      expect('created' in outcome).toBe(true)
    },
  )

  it('counts from the start of the start day when legacy stored a time of day (SQD-03)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament({ start: '2026-10-23 14:00:00' })

    const outcome = await writer.create(tournamentId, { ...full, date: '2026-10-23T09:00:00' })

    expect('created' in outcome).toBe(true)
  })

  it('allows a second squad at the same time on the same lanes (D-169)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    await writer.create(tournamentId, full)
    await writer.create(tournamentId, full)

    expect(await countSquads(tournamentId)).toBe(2)
  })
})
