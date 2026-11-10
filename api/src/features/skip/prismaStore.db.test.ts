import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaSkipStore } from './prismaStore.ts'

const session = 'c0000000-0000-4000-8000-000000000001'

describe('Prisma skip store', () => {
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

  const store = () => createPrismaSkipStore(client, createCapturedLogger().logger)

  it('reads staggered when no row exists (SCR-23, D-235)', async () => {
    expect(await store().get(session)).toBe('staggered')
  })

  it('saves a skip and changes it, with one row for the session (SCR-23)', async () => {
    await store().set(session, 'same')
    expect(await store().get(session)).toBe('same')
    await store().set(session, 'staggered')
    expect(await store().get(session)).toBe('staggered')
    expect(await client.sessionSkip.count()).toBe(1)
  })

  it('reads staggered for stored text it does not know, so a hand-edited row cannot break a page', async () => {
    await client.$executeRawUnsafe(
      "INSERT INTO SessionSkip (SessionId, Skip) VALUES (?, 'zigzag')",
      session,
    )
    expect(await store().get(session)).toBe('staggered')
  })

  it('keeps each session apart', async () => {
    await store().set(session, 'same')
    expect(await store().get('c0000000-0000-4000-8000-000000000002')).toBe('staggered')
  })
})
