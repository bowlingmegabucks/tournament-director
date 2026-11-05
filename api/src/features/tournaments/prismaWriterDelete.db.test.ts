import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows, type LegacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { paidMessage, scoresMessage, completeMessage } from './deletePlan.ts'
import { createPrismaTournamentWriter } from './prismaWriter.ts'

describe('Prisma tournament writer: delete (TRN-32 to TRN-35, D-132 to D-135)', () => {
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

  const writer = () => createPrismaTournamentWriter(client, createCapturedLogger().logger)
  const remove = (id: string, confirmWarnings = false) => writer().remove(id, { confirmWarnings })

  async function count(table: string): Promise<number> {
    const [row] = await client.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM \`${table}\``,
    )
    return Number(row?.n ?? 0)
  }

  it('answers notFound for an unknown id', async () => {
    expect(await remove(crypto.randomUUID())).toEqual({ notFound: true })
  })

  it('deletes a tournament with divisions and sessions at once, no confirmation (TRN-34)', async () => {
    const id = await rows.tournament()
    await rows.division(id)
    await rows.session(id, 'squad', '2026-10-24 09:00:00')
    await rows.session(id, 'sweeper', '2026-10-24 13:00:00')

    expect(await remove(id)).toMatchObject({
      deleted: { divisions: 1, squads: 1, sweepers: 1, registrations: 0 },
    })

    expect(await count('Tournaments')).toBe(0)
    expect(await count('Divisions')).toBe(0)
    expect(await count('Squads')).toBe(0)
  })

  it('refuses a complete tournament and deletes nothing (TRN-33, D-130)', async () => {
    const id = await rows.tournament({ completed: true })

    expect(await remove(id, true)).toEqual({ refused: [completeMessage] })
    expect(await count('Tournaments')).toBe(1)
  })

  it('refuses once any score exists, a sweeper score included (TRN-33)', async () => {
    const id = await rows.tournament()
    const division = await rows.division(id)
    const sweeper = await rows.session(id, 'sweeper', '2026-10-24 13:00:00')
    const { bowlerId, registrationId } = await rows.registration(division)
    await rows.squadEntry(registrationId, sweeper)
    await rows.score(bowlerId, sweeper)

    expect(await remove(id, true)).toEqual({ refused: [scoresMessage] })
    expect(await count('Registrations')).toBe(1)
    expect(await count('SquadScores')).toBe(1)
  })

  it('refuses when a real payment exists, counting registrations that paid (TRN-33, D-106)', async () => {
    const id = await rows.tournament()
    const division = await rows.division(id)
    const first = await rows.registration(division)
    const second = await rows.registration(division)
    await rows.payment(first.registrationId, 'Stripe_pi_1', 60)
    await rows.payment(first.registrationId, 'Stripe_pi_2', 15)
    await rows.payment(second.registrationId, 'Manual_0001', 0)

    expect(await remove(id, true)).toEqual({ refused: [paidMessage(1)] })
    expect(await count('Payments')).toBe(3)
    expect(await count('Tournaments')).toBe(1)
  })

  it('does not call a $0 processor payment or a desk Manual_ code a real payment (TRN-33, D-106)', async () => {
    const id = await rows.tournament()
    const division = await rows.division(id)
    const first = await rows.registration(division)
    const second = await rows.registration(division)
    await rows.payment(first.registrationId, 'Stripe_zero', 0)
    // Real needs both: a code that is not Manual_ and an amount above 0 (D-106).
    await rows.payment(second.registrationId, 'Manual_0002', 25)

    expect(await remove(id)).toMatchObject({ warnings: [{ field: 'tournament' }] })
    expect(await count('Tournaments')).toBe(1)
  })

  it('counts a code that only starts like Manual_ as a real payment (TRN-33, D-106)', async () => {
    const id = await rows.tournament()
    const division = await rows.division(id)
    const { registrationId } = await rows.registration(division)
    // `_` is a wildcard in SQL LIKE. 'ManualX' must not pass for the desk's 'Manual_' prefix.
    await rows.payment(registrationId, 'ManualX0004', 25)

    expect(await remove(id)).toMatchObject({ refused: [expect.stringContaining('paid online')] })
    expect(await count('Tournaments')).toBe(1)
  })

  it('warns when registrations exist and deletes nothing until confirmed (TRN-34)', async () => {
    const id = await rows.tournament()
    const division = await rows.division(id)
    const squad = await rows.session(id, 'squad', '2026-10-24 09:00:00')
    const { registrationId } = await rows.registration(division)
    await rows.squadEntry(registrationId, squad)

    const outcome = await remove(id)

    expect(outcome).toEqual({
      warnings: [
        {
          field: 'tournament',
          message:
            '1 registration, 1 division, and 1 squad will be deleted, with their lane assignments and payment records. The bowlers stay.',
        },
      ],
    })
    expect(await count('Tournaments')).toBe(1)
    expect(await count('Registrations')).toBe(1)
  })

  it('deletes the tournament, its registrations, entries, and payments, and keeps the bowlers (TRN-35)', async () => {
    const id = await rows.tournament()
    const division = await rows.division(id)
    const squad = await rows.session(id, 'squad', '2026-10-24 09:00:00')
    const sweeper = await rows.session(id, 'sweeper', '2026-10-24 13:00:00')
    const { registrationId } = await rows.registration(division)
    await rows.squadEntry(registrationId, squad)
    await rows.squadEntry(registrationId, sweeper)
    await rows.payment(registrationId, 'Manual_0003', 0)

    const outcome = await remove(id, true)

    expect(outcome).toMatchObject({
      deleted: { registrations: 1, divisions: 1, squads: 1, sweepers: 1 },
    })
    for (const table of [
      'Tournaments',
      'Divisions',
      'Squads',
      'Registrations',
      'SquadRegistration',
      'Payments',
    ]) {
      expect(await count(table), table).toBe(0)
    }
    expect(await count('Bowlers')).toBe(1)
  })

  it('leaves other tournaments alone (TRN-35)', async () => {
    const doomed = await rows.tournament()
    const kept = await rows.tournament()
    const keptDivision = await rows.division(kept)
    const keptSquad = await rows.session(kept, 'squad', '2026-10-24 09:00:00')
    const { registrationId } = await rows.registration(keptDivision)
    await rows.squadEntry(registrationId, keptSquad)
    await rows.payment(registrationId, 'Stripe_keep', 40)
    await rows.division(doomed)

    expect(await remove(doomed)).toMatchObject({ deleted: { divisions: 1 } })

    expect(await count('Tournaments')).toBe(1)
    expect(await count('Divisions')).toBe(1)
    expect(await count('Squads')).toBe(1)
    expect(await count('Registrations')).toBe(1)
    expect(await count('SquadRegistration')).toBe(1)
    expect(await count('Payments')).toBe(1)
  })

  it('lets only one of two simultaneous deletes remove the tournament (TRN-35, D-135)', async () => {
    const id = await rows.tournament()
    const division = await rows.division(id)
    await rows.registration(division)

    const outcomes = await Promise.all([remove(id, true), remove(id, true)])

    expect(outcomes.filter((outcome) => 'deleted' in outcome)).toHaveLength(1)
    expect(outcomes.filter((outcome) => 'notFound' in outcome)).toHaveLength(1)
    expect(await count('Tournaments')).toBe(0)
    expect(await count('Registrations')).toBe(0)
  })
})
