import { loadDatabaseUrl } from '../config.ts'
import { isLocalDatabase } from './localDatabase.ts'
import { createScriptAuth } from './scriptAuth.ts'
import { seedUsers } from './seedUsers.ts'
import { createDatabaseClient } from '../shared/database.ts'
import { seedDivisions } from './seedDivisions.ts'
import { seedRegistrations } from './seedRegistrations.ts'
import { seedScores } from './seedScores.ts'
import { seedSessions } from './seedSessions.ts'
import { seedTournaments } from './seedTournaments.ts'

// Run with `npm run db:seed`. It reads DATABASE_URL from .env. Local databases only.
const databaseUrl = loadDatabaseUrl()
const client = createDatabaseClient(databaseUrl)
try {
  const count = await seedTournaments(client)
  console.log(`Seeded ${count} tournaments.`)
  console.log(`Seeded ${await seedDivisions(client)} divisions.`)
  console.log(`Seeded ${await seedSessions(client)} squads and sweepers.`)
  console.log(`Seeded ${await seedRegistrations(client)} registrations.`)
  console.log(`Seeded ${await seedScores(client)} scores.`)
  // Known passwords: only ever on this machine.
  if (isLocalDatabase(databaseUrl)) {
    const { added, skippedReason } = await seedUsers(client, createScriptAuth(client), {
      force: process.argv.includes('--force-users'),
    })
    console.log(
      skippedReason === undefined
        ? `Seeded ${added} sign-in users.`
        : `Skipped sign-in users: ${skippedReason}`,
    )
  } else {
    console.log('Skipped sign-in users: the database is not on this machine.')
  }
} finally {
  await client.$disconnect()
}
