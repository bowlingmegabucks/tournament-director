import { loadDatabaseUrl } from '../config.ts'
import { describeDatabase, isLocalDatabase } from '../db/localDatabase.ts'
import { createDatabaseClient } from '../shared/database.ts'
import { authSchemaSql } from './authSchema.ts'
import { legacySchemaSql } from './legacySchema.ts'
import { payoutSchemaSql } from './payoutSchema.ts'
import { scoreSchemaSql } from './scoreSchema.ts'

// Run with `npm run db:tables`. Creates the empty legacy, sign-in, and score tables, the same ones
// the Testcontainers tests use, on an empty LOCAL database. The lifecycle test (web/lifecycle) runs
// it against its own database. It stops on a database that is not on this machine.
const databaseUrl = loadDatabaseUrl()
if (!isLocalDatabase(databaseUrl)) {
  console.error(
    `Refusing to create tables on ${describeDatabase(databaseUrl)}: not on this machine.`,
  )
  process.exit(1)
}
const client = createDatabaseClient(databaseUrl)
try {
  const statements = [
    ...legacySchemaSql,
    ...authSchemaSql(),
    ...scoreSchemaSql(),
    ...payoutSchemaSql(),
  ]
  for (const statement of statements) {
    // In order: a table with a foreign key needs the table it points to first.
    await client.$executeRawUnsafe(statement) // NOSONAR: order matters
  }
  console.log(`Created ${statements.length} tables on ${describeDatabase(databaseUrl)}.`)
} finally {
  await client.$disconnect()
}
