import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { unknownDivisionMessage } from './createPlan.ts'
import type { NewSweeper } from './createRequest.ts'
import { createPrismaSweeperWriter } from './prismaWriter.ts'

const input: NewSweeper = {
  date: '2026-10-24T18:30:00',
  startingLane: 3,
  numberOfLanes: 20,
  maxPerPair: 4,
  entryFee: 20,
  games: 3,
  cashRatio: 5,
  bonusPins: {},
}

/** A client whose transaction fails the way the database does, to test what the writer does next. */
function failingClient(error: unknown): PrismaClient {
  const client: unknown = { $transaction: () => Promise.reject(error) }
  return client as PrismaClient
}

describe('Prisma sweeper writer, when the save fails', () => {
  it('turns a foreign key failure into the unknown division refusal, not a 500 (D-177)', async () => {
    const writer = createPrismaSweeperWriter(
      failingClient(Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' })),
      createCapturedLogger().logger,
    )

    await expect(writer.create('t1', input)).resolves.toEqual({
      refused: { bonusPins: unknownDivisionMessage },
    })
  })

  it('lets any other failure through', async () => {
    const failure = Object.assign(new Error('Out of range'), { code: 'P2020' })
    const writer = createPrismaSweeperWriter(failingClient(failure), createCapturedLogger().logger)

    await expect(writer.create('t1', input)).rejects.toBe(failure)
  })
})
