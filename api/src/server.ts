import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { createInMemoryTournamentRepository } from './features/tournaments/repository.ts'
import { seedTournaments } from './features/tournaments/seed.ts'

const config = loadConfig()
const app = createApp({
  config,
  tournaments: createInMemoryTournamentRepository(seedTournaments),
})

const server = app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`)
})

// Finish open requests before exit, so a deploy does not cut them off.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
