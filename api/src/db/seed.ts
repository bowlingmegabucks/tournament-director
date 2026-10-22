import { loadConfig } from '../config.ts'
import { createDatabaseClient } from '../shared/database.ts'
import { seedTournaments } from './seedTournaments.ts'

// Run with `npm run db:seed`. It reads DATABASE_URL from .env. Local databases only.
const client = createDatabaseClient(loadConfig().databaseUrl)
try {
  const count = await seedTournaments(client)
  console.log(`Seeded ${count} tournaments.`)
} finally {
  await client.$disconnect()
}
