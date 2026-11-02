import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import type { NewTournament } from './createRequest.ts'
import { createPrismaTournamentRepository } from './prismaRepository.ts'
import { createPrismaTournamentWriter } from './prismaWriter.ts'

const input: NewTournament = {
  name: 'Spring Classic',
  startDate: '2027-03-12',
  endDate: '2027-03-14',
  entryFee: 47.5,
  games: 5,
  finalsRatio: 7.5,
  cashRatio: 5,
  superSweeperCashRatio: 4,
  bowlingCenter: 'Bowl-O-Rama',
}

describe('Prisma tournament writer', () => {
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
      writer: createPrismaTournamentWriter(client, captured.logger),
      repository: createPrismaTournamentRepository(client, captured.logger),
    }
  }

  it('stores every column the form sets, with Completed false (TRN-19, D-119)', async () => {
    const { writer } = setup()

    const outcome = await writer.create(input)

    if (!('created' in outcome)) throw new Error('expected a created tournament')
    const [row] = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT Name, DATE_FORMAT(Start, '%Y-%m-%d %H:%i:%s') AS Start,
              DATE_FORMAT(End, '%Y-%m-%d %H:%i:%s') AS End, EntryFee, Games, FinalsRatio, CashRatio,
              SuperSweperCashRatio, BowlingCenter, Completed
         FROM Tournaments WHERE Id = ?`,
      outcome.created.id,
    )
    expect(row).toMatchObject({
      Name: 'Spring Classic',
      Start: '2027-03-12 00:00:00',
      End: '2027-03-14 00:00:00',
      Games: 5,
      BowlingCenter: 'Bowl-O-Rama',
    })
    expect(Number(row?.['EntryFee'])).toBe(47.5)
    expect(Number(row?.['FinalsRatio'])).toBe(7.5)
    expect(Number(row?.['CashRatio'])).toBe(5)
    expect(Number(row?.['SuperSweperCashRatio'])).toBe(4)
    expect(Number(row?.['Completed'])).toBe(0)
  })

  it('reads back through the repository as it was typed (TRN-19, TRN-21)', async () => {
    const { writer, repository } = setup()
    const outcome = await writer.create(input)
    if (!('created' in outcome)) throw new Error('expected a created tournament')

    expect(await repository.get(outcome.created.id)).toEqual({
      id: outcome.created.id,
      name: 'Spring Classic',
      startDate: '2027-03-12',
      endDate: '2027-03-14',
      entryFee: 47.5,
      bowlingCenter: 'Bowl-O-Rama',
    })
    expect(await repository.getSettings(outcome.created.id)).toEqual({
      games: 5,
      finalsRatio: 7.5,
      cashRatio: 5,
      superSweeperCashRatio: 4,
    })
  })

  it('refuses the same name and start date, ignoring case and spaces (TRN-20, D-123)', async () => {
    const { writer } = setup()
    await writer.create(input)

    const again = await writer.create({
      ...input,
      name: '  SPRING classic ',
      endDate: '2027-03-20',
    })

    expect(again).toEqual({ duplicate: true })
    const [count] = await client.$queryRawUnsafe<{ n: bigint }[]>(
      'SELECT COUNT(*) AS n FROM Tournaments',
    )
    expect(Number(count?.n)).toBe(1)
  })

  it('accepts the same name on another start date (TRN-20)', async () => {
    const { writer } = setup()
    await writer.create(input)

    const next = await writer.create({ ...input, startDate: '2028-03-10', endDate: '2028-03-12' })

    expect(next).toHaveProperty('created')
  })

  it('reads a stored super sweeper ratio of 0 as 0 (TRN-21, D-17)', async () => {
    const { repository } = setup()
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, 'Old', '2020-01-01', '2020-01-03', 50, 6, 7.0, 5.0, 'Lanes', 0)`,
      id,
    )

    expect((await repository.getSettings(id))?.superSweeperCashRatio).toBe(0)
  })

  it('gets no settings for an unknown id (TRN-21)', async () => {
    expect(await setup().repository.getSettings(crypto.randomUUID())).toBeUndefined()
  })

  it('fails on a stored row with fewer than one game (TRN-21, D-31)', async () => {
    const { repository } = setup()
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, 'Odd', '2020-01-01', '2020-01-03', 50, 0, 7.0, 5.0, 'Lanes', 0)`,
      id,
    )

    await expect(repository.getSettings(id)).rejects.toThrow(/breaks the settings shape/)
  })
})
