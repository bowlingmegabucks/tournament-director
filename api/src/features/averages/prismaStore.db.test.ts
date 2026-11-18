import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { HttpError } from '../../shared/errors.ts'
import { createPrismaAverageStore } from './prismaStore.ts'

describe('Prisma average store', () => {
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

  const store = () => createPrismaAverageStore(client, createCapturedLogger().logger)
  const run = (sql: string, ...values: unknown[]) => client.$executeRawUnsafe(sql, ...values)

  async function world() {
    const rows = legacyRows(client)
    const tournamentId = await rows.tournament()
    const handicapId = await rows.division(tournamentId, { name: 'Handicap A', number: 1 })
    const scratchId = await rows.division(tournamentId, { name: 'Open', number: 2 })
    await run(
      'UPDATE Divisions SET HandicapPercentage = 0.90, HandicapBase = 220, MaximumAverage = 190 WHERE Id = ?',
      handicapId,
    )
    const squadId = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const bill = await rows.registration(handicapId)
    const open = await rows.registration(scratchId)
    await run('UPDATE Registrations SET Average = 175 WHERE Id = ?', bill.registrationId)
    await rows.squadEntry(bill.registrationId, squadId)
    return { rows, tournamentId, squadId, bill, open, handicapId }
  }

  it('lists only the registrations of handicap divisions, unverified at first (AVG-02)', async () => {
    const { tournamentId, bill } = await world()

    const listing = await store().list(tournamentId)

    expect(listing?.tournamentComplete).toBe(false)
    expect(listing?.rows).toHaveLength(1)
    expect(listing?.rows[0]).toMatchObject({
      registrationId: bill.registrationId,
      divisionName: 'Handicap A',
      providedAverage: 175,
      status: 'unverified',
      averageInUse: 175,
    })
  })

  it('answers undefined for an unknown tournament (AVG-02)', async () => {
    expect(await store().list(crypto.randomUUID())).toBeUndefined()
  })

  it('keeps one row for each registration and reads it back (AVG-01, AVG-04)', async () => {
    const { tournamentId, bill } = await world()
    const averages = store()

    await averages.save(
      bill.registrationId,
      { providedAverage: 175, verifiedAverage: 175, note: null },
      'user-1',
    )
    await averages.save(
      bill.registrationId,
      { providedAverage: 175, verifiedAverage: 182, note: 'USBC book' },
      'user-2',
    )

    expect(await client.averageVerification.count()).toBe(1)
    const listing = await averages.list(tournamentId)
    expect(listing?.rows[0]).toMatchObject({
      status: 'adjusted',
      averageInUse: 182,
      providedAverage: 175,
      note: 'USBC book',
    })
  })

  it('names the user who checked it (AVG-04)', async () => {
    const { tournamentId, bill } = await world()
    await run(
      "INSERT INTO `user` (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('user-1', 'Dana Reyes', 'dana@example.com', 1, NOW(3), NOW(3))",
    )
    await store().save(
      bill.registrationId,
      { providedAverage: 175, verifiedAverage: 175, note: null },
      'user-1',
    )

    const listing = await store().list(tournamentId)

    expect(listing?.rows[0]?.verifiedBy).toBe('Dana Reyes')
    expect(listing?.rows[0]?.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('removes a check (AVG-07)', async () => {
    const { bill } = await world()
    const averages = store()
    await averages.save(
      bill.registrationId,
      { providedAverage: 175, verifiedAverage: 175, note: null },
      'user-1',
    )

    await averages.remove(bill.registrationId)

    expect(await client.averageVerification.count()).toBe(0)
  })

  it('reads what a save needs: division limits, sessions, and the check (AVG-05)', async () => {
    const { tournamentId, squadId, bill } = await world()

    const reading = await store().read(tournamentId, bill.registrationId)

    expect(reading).toMatchObject({
      handicap: true,
      providedAverage: 175,
      maximumAverage: 190,
      minimumAverage: null,
      tournamentComplete: false,
      scored: [],
      existing: undefined,
      sessionIds: [squadId],
    })
  })

  it('answers undefined for a registration of another tournament (AVG-03)', async () => {
    const { rows, bill } = await world()
    const other = await rows.tournament()

    expect(await store().read(other, bill.registrationId)).toBeUndefined()
  })

  it('reports a score in a complete session of this tournament only (AVG-06)', async () => {
    const { rows, tournamentId, squadId, bill } = await world()
    await rows.score(bill.bowlerId, squadId)
    // The bowler also scored in another tournament: it does not count here.
    const elsewhere = await rows.tournament()
    const otherSquad = await rows.session(elsewhere, 'squad', '2026-10-24 09:00:00')
    await rows.score(bill.bowlerId, otherSquad)
    await run('UPDATE Squads SET Complete = 1 WHERE Id = ?', squadId)

    const reading = await store().read(tournamentId, bill.registrationId)

    expect(reading?.scored).toEqual([{ complete: true }])
  })

  it('ignores a check made on an average the registration no longer holds (AVG-08)', async () => {
    const { tournamentId, bill } = await world()
    await store().save(
      bill.registrationId,
      { providedAverage: 175, verifiedAverage: 175, note: null },
      'director-1',
    )
    // WinForms writes the column directly until it is sunset.
    await run('UPDATE Registrations SET Average = 150 WHERE Id = ?', bill.registrationId)

    const listing = await store().list(tournamentId)
    const reading = await store().read(tournamentId, bill.registrationId)

    expect(listing?.rows[0]).toMatchObject({
      status: 'unverified',
      providedAverage: 150,
      averageInUse: 150,
    })
    expect(reading?.existing).toBeUndefined()
  })

  describe('a save that checks what it was planned from (D-130, D-294)', () => {
    const check = { providedAverage: 175, verifiedAverage: 175, note: null }

    it('writes when nothing changed since the read', async () => {
      const { tournamentId, bill } = await world()
      const reading = await store().read(tournamentId, bill.registrationId)
      if (!reading) throw new Error('no reading')

      await store().save(bill.registrationId, check, 'director-1', { tournamentId, reading })

      expect((await store().list(tournamentId))?.rows[0]?.status).toBe('verified')
    })

    it('answers 409 and writes nothing when the tournament was completed after the read', async () => {
      const { tournamentId, bill } = await world()
      const reading = await store().read(tournamentId, bill.registrationId)
      if (!reading) throw new Error('no reading')
      await run('UPDATE Tournaments SET Completed = 1 WHERE Id = ?', tournamentId)

      await expect(
        store().save(bill.registrationId, check, 'director-1', { tournamentId, reading }),
      ).rejects.toMatchObject({ status: 409 })
      await expect(
        store().save(bill.registrationId, check, 'director-1', { tournamentId, reading }),
      ).rejects.toBeInstanceOf(HttpError)

      expect((await store().list(tournamentId))?.rows[0]?.status).toBe('unverified')
    })

    it('answers 409 when a score was saved after the read, so the scores warning is not skipped', async () => {
      const { rows, tournamentId, squadId, bill } = await world()
      const reading = await store().read(tournamentId, bill.registrationId)
      if (!reading) throw new Error('no reading')
      await rows.score(bill.bowlerId, squadId)

      await expect(
        store().save(bill.registrationId, check, 'director-1', { tournamentId, reading }),
      ).rejects.toMatchObject({ status: 409 })
    })

    it('keeps the check when a removal was planned from an old reading', async () => {
      const { tournamentId, bill } = await world()
      await store().save(bill.registrationId, check, 'director-1')
      const reading = await store().read(tournamentId, bill.registrationId)
      if (!reading) throw new Error('no reading')
      await run('UPDATE Tournaments SET Completed = 1 WHERE Id = ?', tournamentId)

      await expect(
        store().remove(bill.registrationId, { tournamentId, reading }),
      ).rejects.toMatchObject({ status: 409 })

      expect((await store().list(tournamentId))?.rows[0]?.status).toBe('verified')
    })
  })

  it('says a division with no handicap is not a handicap division (AVG-02)', async () => {
    const { tournamentId, open } = await world()

    expect((await store().read(tournamentId, open.registrationId))?.handicap).toBe(false)
  })
})
