import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { resetDatabase } from './resetDatabase.ts'

describe('resetDatabase', () => {
  let client: PrismaClient

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (UUID(), 'Leftover', '2026-10-23', '2026-10-25', 50, 6, 7, 5, 'Lanes', 0)`,
    )
  })

  it('empties every table', async () => {
    await resetDatabase(client)

    expect(await client.tournament.count()).toBe(0)
  })
})
