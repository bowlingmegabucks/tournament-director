import type { Auth } from '../shared/auth/createAuth.ts'
import type { RoleName } from '../shared/auth/roles.ts'
import type { PrismaClient } from '../shared/database.ts'
import { samples } from './seedTournaments.ts'

/**
 * Sign-in users for a local database, one per role, with passwords anyone can read in this file.
 * That is the point: you can try each role. `db:seed` adds them to a local database only
 * (`isLocalDatabase`), never to a real one. Listed in docs/api-standards.md.
 */
export const localUsers: readonly {
  email: string
  name: string
  role: RoleName
  password: string
}[] = [
  {
    email: 'admin@example.com',
    name: 'Local Admin',
    role: 'admin',
    password: 'adminP4sswordLocal',
  },
  {
    email: 'director@example.com',
    name: 'Local Director',
    role: 'director',
    password: 'directorP4sswordLocal',
  },
  {
    email: 'scorekeeper@example.com',
    name: 'Local Score Keeper',
    role: 'scoreKeeper',
    password: 'scoreKeeperP4sswordLocal',
  },
]

export interface SeedUsersResult {
  /** How many users it added. */
  added: number
  /** Why it did nothing, when it refused. */
  skippedReason?: string
}

/**
 * Add the local users that are missing. Safe to run again: a user who exists is left alone, so a
 * password you changed stays changed.
 *
 * It refuses when the table holds a user who is not one of these three, or the database holds a
 * tournament that is not a sample. Their passwords are public,
 * so they must never reach a real database, and the host check in `isLocalDatabase` is fooled by a
 * tunnel to production (the host is then `localhost`). A real database always holds someone real,
 * such as the first admin. `force` skips the refusal, for a local database where you made your own
 * user too.
 */
export async function seedUsers(
  client: PrismaClient,
  auth: Auth,
  { force = false }: { force?: boolean } = {},
): Promise<SeedUsersResult> {
  if (!force) {
    const others = await client.user.count({
      where: { email: { notIn: localUsers.map(({ email }) => email) } },
    })
    // An empty user table proves nothing: a production database that has no admin yet looks the
    // same. A tournament that is not one of ours shows it holds real data.
    const realTournaments = await client.tournament.count({
      where: { id: { notIn: samples.map(({ id }) => id) } },
    })
    if (others > 0 || realTournaments > 0) {
      return {
        added: 0,
        skippedReason:
          'the database has users or tournaments that are not the sample ones, so it may not be a local one. Add --force-users to add them anyway.',
      }
    }
  }
  const existing = await client.user.findMany({
    where: { email: { in: localUsers.map(({ email }) => email) } },
    select: { email: true },
  })
  const have = new Set(existing.map(({ email }) => email))
  const missing = localUsers.filter(({ email }) => !have.has(email))
  for (const user of missing) {
    // One at a time: each hashes a password, and the order is the order above.
    await auth.api.createUser({ body: user }) // NOSONAR
  }
  return { added: missing.length }
}
