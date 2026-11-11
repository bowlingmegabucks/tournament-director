import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { legacyRows } from '../../test/legacyRows.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaDnfStore } from './prismaStore.ts'

const sessionA = 'c0000000-0000-4000-8000-000000000001'
const sessionB = 'c0000000-0000-4000-8000-000000000002'
const bowler1 = 'd0000000-0000-4000-8000-000000000001'
const bowler2 = 'd0000000-0000-4000-8000-000000000002'

describe('Prisma DNF store', () => {
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

  const store = () => createPrismaDnfStore(client, createCapturedLogger().logger)

  it('flags a bowler once and says whether the flag is new (SCR-24, D-248)', async () => {
    expect(await store().set(sessionA, bowler1)).toBe(true)
    expect(await store().set(sessionA, bowler1)).toBe(false)
    expect(await client.sessionDnf.count()).toBe(1)
  })

  it('removes a flag and says whether there was one (SCR-24)', async () => {
    await store().set(sessionA, bowler1)

    expect(await store().clear(sessionA, bowler1)).toBe(true)
    expect(await store().clear(sessionA, bowler1)).toBe(false)
    expect(await client.sessionDnf.count()).toBe(0)
  })

  it('lists the flags of the sessions asked for and no others (RES-55)', async () => {
    await store().set(sessionA, bowler1)
    await store().set(sessionA, bowler2)
    await store().set(sessionB, bowler1)

    const found = await store().listFlagged([sessionA])

    expect([...found.keys()]).toEqual([sessionA])
    expect(found.get(sessionA)).toEqual(new Set([bowler1, bowler2]))
  })

  it('lists nothing for no sessions, and has no entry for a session with no flag', async () => {
    expect((await store().listFlagged([])).size).toBe(0)
    expect((await store().listFlagged([sessionA])).size).toBe(0)
  })

  it('keeps the same bowler flagged in two sessions apart (SCR-24)', async () => {
    await store().set(sessionA, bowler1)
    await store().clear(sessionB, bowler1)

    expect((await store().listFlagged([sessionA])).get(sessionA)).toEqual(new Set([bowler1]))
  })

  describe('the guarded write (D-249)', () => {
    async function world(options: { completed?: boolean; sessionComplete?: boolean } = {}) {
      const rows = legacyRows(client)
      const tournamentId = await rows.tournament({ completed: options.completed })
      const divisionId = await rows.division(tournamentId)
      const sessionId = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
      if (options.sessionComplete) {
        await client.$executeRawUnsafe('UPDATE Squads SET Complete = 1 WHERE Id = ?', sessionId)
      }
      const { registrationId, bowlerId } = await rows.registration(divisionId)
      await rows.squadEntry(registrationId, sessionId, '1A')
      const score = () =>
        client.$executeRawUnsafe(
          'INSERT INTO SquadScores (BowlerId, SquadId, Game, Score) VALUES (?, ?, 1, 200)',
          bowlerId,
          sessionId,
        )
      const input = { tournamentId, kind: 'squad' as const, sessionId, registrationId }
      return { input, score }
    }

    it('flags a bowler with a score in an open session, and a repeat changes nothing', async () => {
      const { input, score } = await world()
      await score()

      expect(await store().setIfOpen(input)).toBe('set')
      expect(await store().setIfOpen(input)).toBe('same')
      expect(await client.sessionDnf.count()).toBe(1)
    })

    it('refuses a bowler with no score and writes nothing', async () => {
      const { input } = await world()

      expect(await store().setIfOpen(input)).toBe('no-score')
      expect(await client.sessionDnf.count()).toBe(0)
    })

    it('refuses a complete session and a complete tournament and writes nothing', async () => {
      for (const options of [{ sessionComplete: true }, { completed: true }]) {
        await resetDatabase(client)
        const { input, score } = await world(options)
        await score()

        expect(await store().setIfOpen(input)).toBe('complete')
        expect(await client.sessionDnf.count()).toBe(0)
      }
    })
  })
})
