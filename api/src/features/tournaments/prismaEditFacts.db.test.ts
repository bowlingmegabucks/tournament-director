import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows, type LegacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { loadEditFacts } from './prismaEditFacts.ts'
import { createPrismaTournamentRepository } from './prismaRepository.ts'

describe('edit facts on MariaDB (TRN-28, D-128, D-131)', () => {
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

  const repository = () => createPrismaTournamentRepository(client, createCapturedLogger().logger)

  it('finds nothing in a tournament with no squads, registrations, or scores', async () => {
    const id = await rows.tournament()

    expect(await loadEditFacts(client, id)).toEqual({
      registrationCount: 0,
      hasScores: false,
      hasSweeperScores: false,
      firstSession: undefined,
      lastSession: undefined,
    })
  })

  it('counts registrations through their division, for this tournament only', async () => {
    const id = await rows.tournament()
    const other = await rows.tournament()
    const division = await rows.division(id)
    await rows.registration(division)
    await rows.registration(division)
    await rows.registration(await rows.division(other))

    expect((await loadEditFacts(client, id)).registrationCount).toBe(2)
    expect((await repository().getEditInfo(id))?.registrationCount).toBe(2)
  })

  it('sees a squad score, not a sweeper score, in hasScores only (D-128)', async () => {
    const id = await rows.tournament()
    const { bowlerId } = await rows.registration(await rows.division(id))
    const squad = await rows.session(id, 'squad', '2026-10-24 09:00:00')
    await rows.score(bowlerId, squad)

    expect(await loadEditFacts(client, id)).toMatchObject({
      hasScores: true,
      hasSweeperScores: false,
    })
  })

  it('sees a sweeper score in both flags', async () => {
    const id = await rows.tournament()
    const { bowlerId } = await rows.registration(await rows.division(id))
    const sweeper = await rows.session(id, 'sweeper', '2026-10-24 19:00:00')
    await rows.score(bowlerId, sweeper)

    expect(await loadEditFacts(client, id)).toMatchObject({
      hasScores: true,
      hasSweeperScores: true,
    })
  })

  it('ignores scores that belong to another tournament', async () => {
    const id = await rows.tournament()
    const other = await rows.tournament()
    const { bowlerId } = await rows.registration(await rows.division(other))
    await rows.score(bowlerId, await rows.session(other, 'squad', '2026-10-24 09:00:00'))
    await rows.session(id, 'squad', '2026-10-24 09:00:00')

    expect(await loadEditFacts(client, id)).toMatchObject({
      hasScores: false,
      hasSweeperScores: false,
    })
  })

  it('names the earliest and latest session, with their kind', async () => {
    const id = await rows.tournament()
    await rows.session(id, 'sweeper', '2026-10-25 19:00:00')
    await rows.session(id, 'squad', '2026-10-23 09:00:00')
    await rows.session(id, 'squad', '2026-10-24 13:00:00')

    const facts = await loadEditFacts(client, id)

    expect(facts.firstSession).toEqual({ kind: 'squad', date: new Date('2026-10-23T09:00:00Z') })
    expect(facts.lastSession).toEqual({ kind: 'sweeper', date: new Date('2026-10-25T19:00:00Z') })
  })

  it('gets no edit info for an unknown id', async () => {
    expect(await repository().getEditInfo(crypto.randomUUID())).toBeUndefined()
  })
})
