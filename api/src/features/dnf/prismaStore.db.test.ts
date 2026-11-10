import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
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
})
