import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { resetDatabase } from '../test/resetDatabase.ts'
import { createDatabaseClient, type PrismaClient } from './database.ts'
import { dropStrandedPairs } from './strandedPairs.ts'

describe('dropStrandedPairs (OOP-07)', () => {
  let client: PrismaClient
  const session = 'a0000000-0000-4000-8000-000000000001'
  const other = 'a0000000-0000-4000-8000-000000000002'

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(client)
    await client.laneOutOfPlay.createMany({
      data: [
        { squadId: session, lane: 1 },
        { squadId: session, lane: 5 },
        { squadId: session, lane: 11 },
        { squadId: other, lane: 11 },
      ],
    })
  })

  const lanesOf = async (squadId: string) => {
    const rows = await client.laneOutOfPlay.findMany({
      where: { squadId },
      orderBy: { lane: 'asc' },
    })
    return rows.map((row) => row.lane)
  }

  it.each([
    ['the same lanes', 1, 12, [1, 5, 11]],
    ['fewer lanes', 1, 8, [1, 5]],
    ['a later start', 5, 8, [5, 11]],
    ['no lanes', 1, 0, []],
  ])('keeps the rows that still start a pair after %s', async (_name, start, count, kept) => {
    await dropStrandedPairs(client, session, start, count)

    expect(await lanesOf(session)).toEqual(kept)
    expect(await lanesOf(other)).toEqual([11])
  })
})
