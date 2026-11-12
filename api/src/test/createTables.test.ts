import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

// The script runs at import, so the test runs it as `npm run db:tables` does. The guard exits
// before any connection, so these cases need no database.
function run(databaseUrl: string) {
  return spawnSync(process.execPath, ['src/test/createTables.ts'], {
    env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  })
}

describe('db:tables', () => {
  it('refuses a database that is not on this machine and names it without the password', () => {
    const result = run('mariadb://admin:s3cret@db.example.com:3306/prod')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Refusing to create tables on db.example.com:3306/prod')
    expect(result.stderr).not.toContain('s3cret')
  })

  it('refuses a host that only starts with localhost', () => {
    const result = run('mariadb://u:p@localhost.example.com:3306/db')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Refusing to create tables')
  })
})
