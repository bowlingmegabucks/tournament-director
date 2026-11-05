import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import type { NewDivision } from './createRequest.ts'
import { createPrismaDivisionRepository } from './prismaRepository.ts'
import { createPrismaDivisionWriter } from './prismaWriter.ts'

const input: NewDivision = {
  name: 'Seniors 50+',
  gender: 'Female',
  minimumAge: 50,
  maximumAge: 120,
  minimumAverage: 100,
  maximumAverage: 300,
  handicapPercentage: 90,
  handicapBase: 220,
  maximumHandicapPerGame: 40,
}
const bare: NewDivision = {
  name: 'Open',
  gender: null,
  minimumAge: null,
  maximumAge: null,
  minimumAverage: null,
  maximumAverage: null,
  handicapPercentage: null,
  handicapBase: null,
  maximumHandicapPerGame: null,
}
const go = { confirmWarnings: false }

describe('Prisma division writer', () => {
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
      writer: createPrismaDivisionWriter(client, captured.logger),
      repository: createPrismaDivisionRepository(client, captured.logger),
    }
  }

  async function insertTournament(completed = false): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, ?, '2026-10-23', '2026-10-25', 50, 6, 7.0, 5.0, 'Lanes', ?)`,
      id,
      `Tournament ${id}`,
      completed ? 1 : 0,
    )
    return id
  }

  async function insertDivision(tournamentId: string, name: string, number: number) {
    await client.$executeRawUnsafe(
      `INSERT INTO Divisions (Id, Name, Number, TournamentId) VALUES (?, ?, ?, ?)`,
      crypto.randomUUID(),
      name,
      number,
      tournamentId,
    )
  }

  it('stores every column, the percent as a fraction and the gender as a code (DIV-12)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    const outcome = await writer.create(tournamentId, input, go)

    if (!('created' in outcome)) throw new Error('expected a created division')
    const [row] = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT Name, Number, TournamentId, Gender, MinimumAge, MaximumAge, MinimumAverage,
              MaximumAverage, HandicapPercentage, HandicapBase, MaximumHandicapPerGame
         FROM Divisions WHERE Id = ?`,
      outcome.created.id,
    )
    expect(row).toMatchObject({
      Name: 'Seniors 50+',
      Number: 1,
      TournamentId: tournamentId,
      Gender: 1,
      MinimumAge: 50,
      MaximumAge: 120,
      MinimumAverage: 100,
      MaximumAverage: 300,
      HandicapBase: 220,
      MaximumHandicapPerGame: 40,
    })
    expect(Number(row?.['HandicapPercentage'])).toBe(0.9)
  })

  it('stores NULL for every limit that is not set, and Male as 0 (DIV-12)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    const male = await writer.create(tournamentId, { ...bare, name: 'Men', gender: 'Male' }, go)
    const any = await writer.create(tournamentId, bare, go)

    if (!('created' in male) || !('created' in any)) throw new Error('expected both created')
    const rows = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT Name, Gender, MinimumAge, HandicapPercentage, HandicapBase FROM Divisions
        WHERE TournamentId = ? ORDER BY Number`,
      tournamentId,
    )
    expect(rows).toEqual([
      { Name: 'Men', Gender: 0, MinimumAge: null, HandicapPercentage: null, HandicapBase: null },
      {
        Name: 'Open',
        Gender: null,
        MinimumAge: null,
        HandicapPercentage: null,
        HandicapBase: null,
      },
    ])
  })

  it('stores a percent above 100 whole (DIV-08, D-141)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await insertTournament()

    await writer.create(
      tournamentId,
      { ...input, handicapPercentage: 999 },
      { confirmWarnings: true },
    )

    const [stored] = await repository.listByTournament(tournamentId)
    expect(stored?.handicapPercentage).toBe(999)
  })

  it('reads back through the repository as it was typed (DIV-12, DIV-13)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await insertTournament()

    const outcome = await writer.create(tournamentId, input, go)

    if (!('created' in outcome)) throw new Error('expected a created division')
    expect(await repository.listByTournament(tournamentId)).toEqual([outcome.created])
  })

  it('assigns one more than the highest number, and 1 for the first (DIV-01, D-139)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    await insertDivision(tournamentId, 'Old A', 2)
    await insertDivision(tournamentId, 'Old B', 7)
    const empty = await insertTournament()

    const next = await writer.create(tournamentId, bare, go)
    const first = await writer.create(empty, bare, go)

    expect(next).toMatchObject({ created: { number: 8 } })
    expect(first).toMatchObject({ created: { number: 1 } })
  })

  it('numbers from the tournament named, ignoring other tournaments (D-139)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const other = await insertTournament()
    await insertDivision(other, 'Elsewhere', 40)

    expect(await writer.create(tournamentId, bare, go)).toMatchObject({ created: { number: 1 } })
  })

  it('answers notFound for an unknown tournament and stores nothing (DIV-03)', async () => {
    const { writer } = setup()

    const outcome = await writer.create(crypto.randomUUID(), bare, go)

    expect(outcome).toEqual({ notFound: true })
    const [count] = await client.$queryRawUnsafe<{ n: bigint }[]>(
      'SELECT COUNT(*) AS n FROM Divisions',
    )
    expect(Number(count?.n)).toBe(0)
  })

  it('refuses a complete tournament and stores nothing (D-143)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament(true)

    const outcome = await writer.create(tournamentId, bare, go)

    expect(outcome).toMatchObject({ refused: { tournament: expect.any(String) } })
    const [count] = await client.$queryRawUnsafe<{ n: bigint }[]>(
      'SELECT COUNT(*) AS n FROM Divisions',
    )
    expect(Number(count?.n)).toBe(0)
  })

  it('refuses a name already used, ignoring case and spaces, in the same tournament (DIV-02, D-140)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    await insertDivision(tournamentId, 'Open', 1)

    const outcome = await writer.create(tournamentId, { ...bare, name: '  oPEN ' }, go)

    expect(outcome).toMatchObject({ refused: { name: expect.any(String) } })
  })

  it('allows a name another tournament uses (D-140)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const other = await insertTournament()
    await insertDivision(other, 'Open', 1)

    expect(await writer.create(tournamentId, bare, go)).toMatchObject({ created: { number: 1 } })
  })

  it('warns about a percent over 100 and stores nothing until confirmed (DIV-08, D-142)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const unusual = { ...input, handicapPercentage: 110 }

    const warned = await writer.create(tournamentId, unusual, go)
    const [before] = await client.$queryRawUnsafe<{ n: bigint }[]>(
      'SELECT COUNT(*) AS n FROM Divisions',
    )
    const confirmed = await writer.create(tournamentId, unusual, { confirmWarnings: true })

    expect(warned).toMatchObject({ warnings: [{ field: 'handicapPercentage' }] })
    expect(Number(before?.n)).toBe(0)
    expect(confirmed).toMatchObject({ created: { number: 1, handicapPercentage: 110 } })
  })

  it('gives two creates at once different numbers (DIV-15, D-139)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    const outcomes = await Promise.all([
      writer.create(tournamentId, { ...bare, name: 'Alpha' }, go),
      writer.create(tournamentId, { ...bare, name: 'Beta' }, go),
    ])

    const numbers = outcomes.flatMap((outcome) =>
      'created' in outcome ? [outcome.created.number] : [],
    )
    expect(numbers.toSorted()).toEqual([1, 2])
  })

  it('keeps one of two equal names sent at once (DIV-02, D-140)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()

    const outcomes = await Promise.all([
      writer.create(tournamentId, { ...bare, name: 'Same' }, go),
      writer.create(tournamentId, { ...bare, name: 'same' }, go),
    ])

    expect(outcomes.filter((outcome) => 'created' in outcome)).toHaveLength(1)
    expect(outcomes.filter((outcome) => 'refused' in outcome)).toHaveLength(1)
  })
})
