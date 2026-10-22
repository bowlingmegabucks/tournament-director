import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { resetDatabase } from '../test/resetDatabase.ts'

const run = promisify(execFile)

describe('db:seed script', () => {
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

  it('reads DATABASE_URL, seeds four tournaments, and reports the count', async () => {
    const { stdout } = await run(process.execPath, ['src/db/seed.ts'], {
      env: { ...process.env, DATABASE_URL: inject('databaseUrl') },
    })

    expect(stdout).toContain('Seeded 4 tournaments.')
    expect(await client.tournament.count()).toBe(4)
  })

  it('fails with no DATABASE_URL and seeds nothing', async () => {
    const env = { ...process.env }
    delete env.DATABASE_URL
    await expect(run(process.execPath, ['src/db/seed.ts'], { env })).rejects.toThrow()
    expect(await client.tournament.count()).toBe(0)
  })
})
