import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows, type LegacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { completeMessage, duplicateNameMessage } from './createPlan.ts'
import { eligibilityMessage, handicapScoresMessage } from './editPlan.ts'
import { createPrismaDivisionRepository } from './prismaRepository.ts'
import { createPrismaDivisionWriter } from './prismaWriter.ts'

const go = { confirmWarnings: false }
const confirmed = { confirmWarnings: true }

describe('Prisma division writer: update (DIV-12, DIV-15, D-147)', () => {
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

  async function stored(divisionId: string) {
    const [row] = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT Name, Number, Gender, MinimumAge, MaximumAge, MinimumAverage, MaximumAverage,
              HandicapPercentage, HandicapBase, MaximumHandicapPerGame
         FROM Divisions WHERE Id = ?`,
      divisionId,
    )
    return row
  }

  it('changes only the columns sent and leaves the number alone (DIV-12, D-146)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await rows.division(tournamentId, { name: 'Open', number: 3 })
    await client.$executeRawUnsafe(
      'UPDATE Divisions SET MinimumAge = 20, Gender = 0 WHERE Id = ?',
      id,
    )

    const outcome = await writer.update(tournamentId, id, { name: 'Main' }, go)

    expect(outcome).toMatchObject({
      updated: { id, name: 'Main', number: 3, minimumAge: 20 },
      changed: ['name'],
    })
    expect(await stored(id)).toMatchObject({ Name: 'Main', Number: 3, Gender: 0, MinimumAge: 20 })
  })

  it('stores the percent as a fraction, the gender as a code, and null as NULL (DIV-08)', async () => {
    const { writer, repository } = setup()
    const tournamentId = await rows.tournament()
    const id = await rows.division(tournamentId)

    await writer.update(
      tournamentId,
      id,
      { gender: 'Female', handicapPercentage: 85, handicapBase: 210, maximumHandicapPerGame: 30 },
      go,
    )

    const row = await stored(id)
    expect(row).toMatchObject({ Gender: 1, HandicapBase: 210, MaximumHandicapPerGame: 30 })
    expect(Number(row?.['HandicapPercentage'])).toBe(0.85)
    expect((await repository.listByTournament(tournamentId))[0]).toMatchObject({
      gender: 'Female',
      handicapPercentage: 85,
    })

    await writer.update(
      tournamentId,
      id,
      { gender: null, handicapPercentage: null, handicapBase: null, maximumHandicapPerGame: null },
      go,
    )
    expect(await stored(id)).toMatchObject({
      Gender: null,
      HandicapPercentage: null,
      HandicapBase: null,
      MaximumHandicapPerGame: null,
    })
  })

  it('writes nothing when nothing changes', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await rows.division(tournamentId)

    const outcome = await writer.update(tournamentId, id, { name: 'Open' }, go)

    expect(outcome).toMatchObject({ changed: [] })
  })

  it('refuses a name another division of the tournament uses, ignoring case (DIV-15, D-140)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await rows.division(tournamentId, { name: 'Open', number: 1 })
    await rows.division(tournamentId, { name: 'Women', number: 2 })

    const outcome = await writer.update(tournamentId, id, { name: 'women' }, go)

    expect(outcome).toEqual({ refused: { name: duplicateNameMessage } })
    expect((await stored(id))?.['Name']).toBe('Open')
  })

  it('lets a division keep its own name in another case, and a name used in another tournament', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const other = await rows.tournament()
    const id = await rows.division(tournamentId, { name: 'Open', number: 1 })
    await rows.division(other, { name: 'Women', number: 1 })

    expect(await writer.update(tournamentId, id, { name: 'OPEN' }, go)).toMatchObject({
      changed: ['name'],
    })
    expect(await writer.update(tournamentId, id, { name: 'Women' }, go)).toMatchObject({
      changed: ['name'],
    })
  })

  it('two edits at once cannot both take one name (DIV-15)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const first = await rows.division(tournamentId, { name: 'A', number: 1 })
    const second = await rows.division(tournamentId, { name: 'B', number: 2 })

    const outcomes = await Promise.all([
      writer.update(tournamentId, first, { name: 'Same' }, go),
      writer.update(tournamentId, second, { name: 'same' }, go),
    ])

    const saved = outcomes.filter((outcome) => 'updated' in outcome)
    const refused = outcomes.filter((outcome) => 'refused' in outcome)
    expect(saved).toHaveLength(1)
    expect(refused).toHaveLength(1)
    const [count] = await client.$queryRawUnsafe<{ n: bigint }[]>(
      "SELECT COUNT(*) AS n FROM Divisions WHERE LOWER(Name) = 'same'",
    )
    expect(Number(count?.n)).toBe(1)
  })

  it('refuses every change in a complete tournament, read inside the transaction (DIV-03, D-149)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament({ completed: true })
    const id = await rows.division(tournamentId)

    const outcome = await writer.update(tournamentId, id, { name: 'Main' }, confirmed)

    expect(outcome).toEqual({ refused: { tournament: completeMessage } })
    expect((await stored(id))?.['Name']).toBe('Open')
  })

  it("answers notFound for an unknown tournament, an unknown division, and another tournament's division (DIV-03)", async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const other = await rows.tournament()
    const id = await rows.division(tournamentId)

    expect(await writer.update(crypto.randomUUID(), id, { name: 'X' }, go)).toEqual({
      notFound: 'tournament',
    })
    expect(await writer.update(tournamentId, crypto.randomUUID(), { name: 'X' }, go)).toEqual({
      notFound: 'division',
    })
    expect(await writer.update(other, id, { name: 'X' }, go)).toEqual({ notFound: 'division' })
    expect((await stored(id))?.['Name']).toBe('Open')
  })

  it('warns with the registered count, and saves once confirmed (D-12, D-147)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await rows.division(tournamentId)
    await rows.registration(id)
    await rows.registration(id)

    const first = await writer.update(tournamentId, id, { minimumAge: 18 }, go)

    expect(first).toEqual({ warnings: [{ field: 'minimumAge', message: eligibilityMessage(2) }] })
    expect((await stored(id))?.['MinimumAge']).toBeNull()

    const second = await writer.update(tournamentId, id, { minimumAge: 18 }, confirmed)

    expect(second).toMatchObject({ changed: ['minimumAge'] })
    expect((await stored(id))?.['MinimumAge']).toBe(18)
  })

  it('warns about handicap only when a score of this division exists (D-147, D-148)', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const open = await rows.division(tournamentId, { name: 'Open', number: 1 })
    const women = await rows.division(tournamentId, { name: 'Women', number: 2 })
    await client.$executeRawUnsafe(
      'UPDATE Divisions SET HandicapPercentage = 0.90, HandicapBase = 220 WHERE TournamentId = ?',
      tournamentId,
    )
    await rows.registration(open)
    const bowler = await rows.registration(women)
    const squad = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    await rows.score(bowler.bowlerId, squad)

    const free = await writer.update(tournamentId, open, { handicapBase: 200 }, go)
    const warned = await writer.update(tournamentId, women, { handicapBase: 200 }, go)

    expect(free).toMatchObject({ changed: ['handicapBase'] })
    expect(warned).toEqual({
      warnings: [{ field: 'handicapBase', message: handicapScoresMessage }],
    })
  })

  it('refuses a stored division that breaks the read shape instead of editing it', async () => {
    const { writer } = setup()
    const tournamentId = await rows.tournament()
    const id = await rows.division(tournamentId)
    await client.$executeRawUnsafe('UPDATE Divisions SET Gender = 5 WHERE Id = ?', id)

    expect(await writer.update(tournamentId, id, { name: 'Main' }, go)).toEqual({
      refused: {
        name: 'This division holds values the app cannot read, so it cannot be edited here.',
      },
    })
  })
})
