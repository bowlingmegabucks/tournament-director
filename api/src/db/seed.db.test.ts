import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { resetDatabase } from '../test/resetDatabase.ts'

const execFileAsync = promisify(execFile)
const apiRoot = join(import.meta.dirname, '..', '..')

/** Run the seed script from `api/` with only the variables given, so a local `.env` or shell never leaks in. */
function runSeed(env: Record<string, string>) {
  return execFileAsync(process.execPath, ['src/db/seed.ts'], { cwd: apiRoot, env })
}

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

  it('reads DATABASE_URL, seeds four tournaments, twelve divisions, and twenty squads and sweepers, and reports the counts', async () => {
    const { stdout } = await runSeed({ DATABASE_URL: inject('databaseUrl') })

    expect(stdout).toContain('Seeded 4 tournaments.')
    expect(stdout).toContain('Seeded 12 divisions.')
    expect(stdout).toContain('Seeded 20 squads and sweepers.')
    expect(await client.tournament.count()).toBe(4)
    expect(await client.division.count()).toBe(12)
    expect(stdout).toContain('Seeded 80 scores.')
    expect(await client.squad.count()).toBe(20)
  })

  it('fails with no DATABASE_URL and seeds nothing', async () => {
    await expect(runSeed({})).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('DATABASE_URL'),
    })
    expect(await client.tournament.count()).toBe(0)
  })
})
