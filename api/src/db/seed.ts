import { loadConfig } from '../config.ts'
import { createDatabaseClient } from '../shared/database.ts'
import { seedDivisions } from './seedDivisions.ts'
import { seedSessions } from './seedSessions.ts'
import { seedTournaments } from './seedTournaments.ts'

// Run with `npm run db:seed`. It reads DATABASE_URL from .env. Local databases only.
const client = createDatabaseClient(loadConfig().databaseUrl)
try {
  const count = await seedTournaments(client)
  console.log(`Seeded ${count} tournaments.`)
  console.log(`Seeded ${await seedDivisions(client)} divisions.`)
  console.log(`Seeded ${await seedSessions(client)} squads and sweepers.`)
} finally {
  await client.$disconnect()
}
