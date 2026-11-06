import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows, type LegacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { loadDivisionEditFacts } from './prismaEditFacts.ts'
import { createPrismaDivisionWriter } from './prismaWriter.ts'

describe('division edit facts on MariaDB (DIV-12, D-147, D-148)', () => {
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

  it('finds nothing in a division with no registrations', async () => {
    const tournamentId = await rows.tournament()
    const division = await rows.division(tournamentId)

    expect(await loadDivisionEditFacts(client, tournamentId, division)).toEqual({
      registrationCount: 0,
      hasScores: false,
    })
  })

  it('counts the registrations of this division only', async () => {
    const tournamentId = await rows.tournament()
    const open = await rows.division(tournamentId, { name: 'Open', number: 1 })
    const women = await rows.division(tournamentId, { name: 'Women', number: 2 })
    await rows.registration(open)
    await rows.registration(open)
    await rows.registration(women)

    expect((await loadDivisionEditFacts(client, tournamentId, open)).registrationCount).toBe(2)
    expect((await loadDivisionEditFacts(client, tournamentId, women)).registrationCount).toBe(1)
  })

  it('sees a score of a bowler in this division, squad or sweeper (D-148)', async () => {
    const tournamentId = await rows.tournament()
    const division = await rows.division(tournamentId)
    const squad = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const sweeper = await rows.session(tournamentId, 'sweeper', '2026-10-24 19:00:00')
    const first = await rows.registration(division)
    const second = await rows.registration(division)
    await rows.score(first.bowlerId, squad)
    await rows.score(second.bowlerId, sweeper)

    expect((await loadDivisionEditFacts(client, tournamentId, division)).hasScores).toBe(true)
  })

  it('does not count a score of a bowler in another division (D-148)', async () => {
    const tournamentId = await rows.tournament()
    const open = await rows.division(tournamentId, { name: 'Open', number: 1 })
    const women = await rows.division(tournamentId, { name: 'Women', number: 2 })
    await rows.registration(open)
    const bowler = await rows.registration(women)
    const squad = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    await rows.score(bowler.bowlerId, squad)

    expect(await loadDivisionEditFacts(client, tournamentId, open)).toEqual({
      registrationCount: 1,
      hasScores: false,
    })
    expect((await loadDivisionEditFacts(client, tournamentId, women)).hasScores).toBe(true)
  })

  it('does not count a score the bowler made in another tournament (D-148)', async () => {
    const tournamentId = await rows.tournament()
    const other = await rows.tournament()
    const division = await rows.division(tournamentId)
    const { bowlerId } = await rows.registration(division)
    const elsewhere = await rows.session(other, 'squad', '2026-10-24 09:00:00')
    await rows.score(bowlerId, elsewhere)

    expect((await loadDivisionEditFacts(client, tournamentId, division)).hasScores).toBe(false)
  })

  it('does not count a score in a tournament with no squads at all', async () => {
    const tournamentId = await rows.tournament()
    const division = await rows.division(tournamentId)
    await rows.registration(division)

    expect((await loadDivisionEditFacts(client, tournamentId, division)).hasScores).toBe(false)
  })

  it('answers the edit-info read for a division of the tournament, and notFound otherwise', async () => {
    const writer = createPrismaDivisionWriter(client, createCapturedLogger().logger)
    const tournamentId = await rows.tournament()
    const other = await rows.tournament()
    const division = await rows.division(tournamentId)
    await rows.registration(division)

    expect(await writer.getEditInfo(tournamentId, division)).toEqual({
      registrationCount: 1,
      hasScores: false,
    })
    expect(await writer.getEditInfo(crypto.randomUUID(), division)).toEqual({
      notFound: 'tournament',
    })
    expect(await writer.getEditInfo(other, division)).toEqual({ notFound: 'division' })
    expect(await writer.getEditInfo(tournamentId, crypto.randomUUID())).toEqual({
      notFound: 'division',
    })
  })
})
