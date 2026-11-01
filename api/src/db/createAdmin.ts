import { loadDatabaseUrl } from '../config.ts'
import { createDatabaseClient } from '../shared/database.ts'
import { createAdminUser } from './createAdminUser.ts'
import { describeDatabase } from './localDatabase.ts'
import { createScriptAuth } from './scriptAuth.ts'
import { createTerminalPrompts } from './terminalPrompts.ts'

// Run with `npm run users:create-admin`. It reads DATABASE_URL from .env, or from the environment
// (set it to run this against production). Asks for an email, a name, and a password.
const databaseUrl = loadDatabaseUrl()
const client = createDatabaseClient(databaseUrl)
try {
  const prompts = createTerminalPrompts(process.stdin, process.stdout)
  prompts.print(`Database: ${describeDatabase(databaseUrl)}`)
  await createAdminUser({
    auth: createScriptAuth(client),
    countUsers: () => client.user.count(),
    prompts,
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await client.$disconnect()
}
