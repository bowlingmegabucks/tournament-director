import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows, type LegacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { completeMessage } from './createPlan.ts'
import { createPrismaDivisionRepository } from './prismaRepository.ts'
import { createPrismaDivisionWriter } from './prismaWriter.ts'

const create = {
  name: 'Newest',
  gender: null,
  minimumAge: null,
  maximumAge: null,
  minimumAverage: null,
  maximumAverage: null,
  handicapPercentage: null,
  handicapBase: null,
  maximumHandicapPerGame: null,
}

describe('Prisma division writer: delete (DIV-12, DIV-01, DIV-14, D-151 to D-155)', () => {
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
      writer: createPrismaDivisionWriter(client, logger),
      repository: createPrismaDivisionRepository(client, logger),
    }
  }

  const numbers = async (tournamentId: string) =>
    (
      await client.$queryRawUnsafe<{ Name: string; Number: number }[]>(
        'SELECT Name, Number FROM Divisions WHERE TournamentId = ? ORDER BY Number, Name',
        tournamentId,
      )
    ).map((row) => [row.Name, Number(row.Number)])

  /** The one number a `SELECT COUNT(*) AS n` returns. */
  const countOf = async (sql: string, ...values: unknown[]) => {
    const [row] = await client.$queryRawUnsafe<{ n: bigint }[]>(sql, ...values)
    return Number(row?.n ?? -1)
  }

  const exists = async (divisionId: string) =>
    (await client.$queryRawUnsafe<unknown[]>('SELECT 1 FROM Divisions WHERE Id = ?', divisionId))
      .length > 0

  it('removes the row and answers the number it held (DIV-12, D-155)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await rows.division(tournamentId, { name: 'Women', number: 2 })

    const outcome = await writer.remove(tournamentId, id)

    expect(outcome).toEqual({ deleted: { number: 2 } })
    expect(await exists(id)).toBe(false)
  })

  it('moves later numbers down by one and leaves lower ones alone (DIV-01, D-153)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    await rows.division(tournamentId, { name: 'Open', number: 1 })
    const women = await rows.division(tournamentId, { name: 'Women', number: 2 })
    await rows.division(tournamentId, { name: 'Senior', number: 3 })
    await rows.division(tournamentId, { name: 'Junior', number: 4 })

    await writer.remove(tournamentId, women)

    expect(await numbers(tournamentId)).toEqual([
      ['Open', 1],
      ['Senior', 2],
      ['Junior', 3],
    ])
  })

  it('leaves old odd rows below the gap, and a gap that was already there, alone (D-153)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    await rows.division(tournamentId, { name: 'Zero', number: 0 })
    await rows.division(tournamentId, { name: 'First', number: 1 })
    await rows.division(tournamentId, { name: 'Twin', number: 1 })
    const gone = await rows.division(tournamentId, { name: 'Gone', number: 4 })
    await rows.division(tournamentId, { name: 'Late', number: 7 })

    await writer.remove(tournamentId, gone)

    expect(await numbers(tournamentId)).toEqual([
      ['Zero', 0],
      ['First', 1],
      ['Twin', 1],
      ['Late', 6],
    ])
  })

  it('shifts rows that share the number above the gap together (D-153)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const gone = await rows.division(tournamentId, { name: 'Gone', number: 1 })
    await rows.division(tournamentId, { name: 'A', number: 2 })
    await rows.division(tournamentId, { name: 'B', number: 2 })

    await writer.remove(tournamentId, gone)

    expect(await numbers(tournamentId)).toEqual([
      ['A', 1],
      ['B', 1],
    ])
  })

  it('does not touch the numbers of another tournament (D-153)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const other = await rows.tournament()
    const gone = await rows.division(tournamentId, { name: 'Gone', number: 1 })
    await rows.division(tournamentId, { name: 'Next', number: 2 })
    await rows.division(other, { name: 'Elsewhere', number: 2 })

    await writer.remove(tournamentId, gone)

    expect(await numbers(other)).toEqual([['Elsewhere', 2]])
    expect(await numbers(tournamentId)).toEqual([['Next', 1]])
  })

  it('removes the sweeper bonus-pin rows with it and keeps the others (DIV-14, D-152)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const gone = await rows.division(tournamentId, { name: 'Gone', number: 1 })
    const kept = await rows.division(tournamentId, { name: 'Kept', number: 2 })
    const sweeper = await rows.session(tournamentId, 'sweeper', '2026-10-24 19:00:00')
    await rows.sweeperPins(sweeper, gone, 10)
    await rows.sweeperPins(sweeper, kept, 5)

    await writer.remove(tournamentId, gone)

    const left = await client.$queryRawUnsafe<{ DivisionId: string }[]>(
      'SELECT DivisionId FROM SweeperDivision',
    )
    expect(left.map((row) => row.DivisionId)).toEqual([kept])
  })

  it('refuses a division with bowlers, and keeps it, its numbers, and the registrations (D-151)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const open = await rows.division(tournamentId, { name: 'Open', number: 1 })
    await rows.division(tournamentId, { name: 'Women', number: 2 })
    await rows.registration(open)
    await rows.registration(open)

    const outcome = await writer.remove(tournamentId, open)

    const message =
      '2 bowlers are registered in this division. Move them to another division first.'
    expect(outcome).toEqual({ refused: { division: message } })
    expect(await numbers(tournamentId)).toEqual([
      ['Open', 1],
      ['Women', 2],
    ])
    expect(
      await countOf('SELECT COUNT(*) AS n FROM Registrations WHERE DivisionId = ?', open),
    ).toBe(2)
  })

  it('counts a bowler with scores as registered, so a scored division stays (D-151)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const open = await rows.division(tournamentId)
    const squad = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const entry = await rows.registration(open)
    await rows.score(entry.bowlerId, squad)

    expect(await writer.remove(tournamentId, open)).toMatchObject({ refused: {} })
    expect(await exists(open)).toBe(true)
  })

  it('refuses a complete tournament and keeps the division (DIV-03, D-143)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament({ completed: true })
    const id = await rows.division(tournamentId)

    const outcome = await writer.remove(tournamentId, id)

    expect(outcome).toEqual({ refused: { tournament: completeMessage } })
    expect(await exists(id)).toBe(true)
  })

  it('lists both reasons when both hold (D-151)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament({ completed: true })
    const id = await rows.division(tournamentId)
    await rows.registration(id)

    const outcome = await writer.remove(tournamentId, id)

    expect(outcome).toMatchObject({ refused: { tournament: completeMessage } })
    expect('refused' in outcome && Object.keys(outcome.refused)).toEqual(['tournament', 'division'])
  })

  it('lets the last division go (D-151)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await rows.division(tournamentId)

    expect(await writer.remove(tournamentId, id)).toEqual({ deleted: { number: 1 } })
    expect(await numbers(tournamentId)).toEqual([])
  })

  it('answers not found for an unknown tournament, an unknown division, or another tournament (DIV-03)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const other = await rows.tournament()
    const mine = await rows.division(tournamentId)
    const theirs = await rows.division(other)

    expect(await writer.remove(crypto.randomUUID(), mine)).toEqual({ notFound: 'tournament' })
    expect(await writer.remove(tournamentId, crypto.randomUUID())).toEqual({
      notFound: 'division',
    })
    expect(await writer.remove(tournamentId, theirs)).toEqual({ notFound: 'division' })
    expect(await exists(theirs)).toBe(true)
  })

  it('numbers the next add one above the highest after a delete (DIV-01, DIV-15, D-139, D-153)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await rows.tournament()
    await rows.division(tournamentId, { name: 'Open', number: 1 })
    const women = await rows.division(tournamentId, { name: 'Women', number: 2 })
    await rows.division(tournamentId, { name: 'Senior', number: 3 })

    await writer.remove(tournamentId, women)
    const outcome = await writer.create(tournamentId, create, { confirmWarnings: false })

    expect(outcome).toMatchObject({ created: { name: 'Newest', number: 3 } })
    const listed = await repository.listByTournament(tournamentId)
    expect(listed.map((division) => [division.name, division.number])).toEqual([
      ['Open', 1],
      ['Senior', 2],
      ['Newest', 3],
    ])
  })

  it('lets exactly one of a delete and a new registration win, every time (D-155)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()

    // Which one wins varies from round to round, so run several and check each round on its own:
    // a registration saved in the division means the delete was refused, and a delete that went
    // through means the registration failed on the key. Never both, never neither.
    for (let round = 0; round < 12; round += 1) {
      const id = await rows.division(tournamentId, { name: `Race ${round}`, number: round + 1 })

      const [removed, registered] = await Promise.allSettled([
        writer.remove(tournamentId, id),
        rows.registration(id),
      ])

      const registrations = await countOf(
        'SELECT COUNT(*) AS n FROM Registrations WHERE DivisionId = ?',
        id,
      )
      const divisions = await countOf('SELECT COUNT(*) AS n FROM Divisions WHERE Id = ?', id)
      expect(removed.status).toBe('fulfilled')
      const deleted = removed.status === 'fulfilled' && 'deleted' in removed.value
      expect(deleted).toBe(registered.status === 'rejected')
      expect(divisions).toBe(deleted ? 0 : 1)
      expect(registrations).toBe(deleted ? 0 : 1)
    }
    const orphans = await countOf(
      `SELECT COUNT(*) AS n FROM Registrations r
       LEFT JOIN Divisions d ON d.Id = r.DivisionId WHERE d.Id IS NULL`,
    )
    expect(orphans).toBe(0)
  })
})

describe('Prisma division writer: delete-info (DIV-12, D-152, D-154)', () => {
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

  const writerOf = () => createPrismaDivisionWriter(client, createCapturedLogger().logger)

  it('answers zero and zero for a division with nothing under it', async () => {
    const tournamentId = await rows.tournament()
    const id = await rows.division(tournamentId)

    expect(await writerOf().getDeleteInfo(tournamentId, id)).toEqual({
      registrationCount: 0,
      sweeperCount: 0,
    })
  })

  it('counts this division’s registrations only', async () => {
    const tournamentId = await rows.tournament()
    const open = await rows.division(tournamentId, { name: 'Open', number: 1 })
    const women = await rows.division(tournamentId, { name: 'Women', number: 2 })
    await rows.registration(open)
    await rows.registration(open)
    await rows.registration(women)

    expect(await writerOf().getDeleteInfo(tournamentId, open)).toMatchObject({
      registrationCount: 2,
    })
  })

  it('counts sweepers with bonus pins above 0 and skips NULL and 0 (D-152)', async () => {
    const tournamentId = await rows.tournament()
    const id = await rows.division(tournamentId)
    const other = await rows.division(tournamentId, { name: 'Other', number: 2 })
    const first = await rows.session(tournamentId, 'sweeper', '2026-10-24 19:00:00')
    const second = await rows.session(tournamentId, 'sweeper', '2026-10-24 20:00:00')
    const third = await rows.session(tournamentId, 'sweeper', '2026-10-24 21:00:00')
    const fourth = await rows.session(tournamentId, 'sweeper', '2026-10-24 22:00:00')
    await rows.sweeperPins(first, id, 10)
    await rows.sweeperPins(second, id, 1)
    await rows.sweeperPins(third, id, null)
    await rows.sweeperPins(fourth, id, 0)
    await rows.sweeperPins(first, other, 5)

    expect(await writerOf().getDeleteInfo(tournamentId, id)).toMatchObject({ sweeperCount: 2 })
  })

  it('answers not found for an unknown tournament, an unknown division, or another tournament', async () => {
    const tournamentId = await rows.tournament()
    const other = await rows.tournament()
    const theirs = await rows.division(other)
    const writer = writerOf()

    expect(await writer.getDeleteInfo(crypto.randomUUID(), theirs)).toEqual({
      notFound: 'tournament',
    })
    expect(await writer.getDeleteInfo(tournamentId, crypto.randomUUID())).toEqual({
      notFound: 'division',
    })
    expect(await writer.getDeleteInfo(tournamentId, theirs)).toEqual({ notFound: 'division' })
  })
})
