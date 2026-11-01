import type { Auth } from '../shared/auth/createAuth.ts'
import type { RoleName } from '../shared/auth/roles.ts'
import type { PrismaClient } from '../shared/database.ts'

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

/**
 * Add the local users that are missing. Safe to run again: a user who exists is left alone, so a
 * password you changed stays changed. Returns how many it added.
 */
export async function seedUsers(client: PrismaClient, auth: Auth): Promise<number> {
  let added = 0
  for (const { email, name, role, password } of localUsers) {
    if ((await client.user.count({ where: { email } })) > 0) continue
    // One at a time: each hashes a password, and the order is the order above.
    await auth.api.createUser({ body: { email, name, password, role } }) // NOSONAR: one at a time
    added++
  }
  return added
}
