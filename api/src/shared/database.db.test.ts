import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createCapturedLogger } from '../test/logger.ts'
import { createDatabaseClient, pingDatabase, type PrismaClient } from './database.ts'

describe('pingDatabase', () => {
  let client: PrismaClient

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
  })
  afterAll(async () => {
    await client.$disconnect()
  })

  it('resolves when the database answers (D-32)', async () => {
    await expect(pingDatabase(client, createCapturedLogger().logger)).resolves.toBeUndefined()
  })

  it('rejects with a 503 when the database does not answer (D-32)', async () => {
    const unreachable = createDatabaseClient('mariadb://u:p@127.0.0.1:1/legacy?acquireTimeout=300')
    try {
      await expect(pingDatabase(unreachable, createCapturedLogger().logger)).rejects.toMatchObject({
        status: 503,
        message: 'Database unavailable',
      })
    } finally {
      await unreachable.$disconnect()
    }
  })
})
