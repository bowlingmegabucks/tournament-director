import type { Express } from 'express'
import { createApp, type AppDependencies } from '../app.ts'
import { createConfig } from './factories.ts'
import { createCapturedLogger } from './logger.ts'
import { createInMemoryTournamentRepository } from '../features/tournaments/repository.ts'

/** An app with in-memory storage, a database that always answers, and no CORS. Override only what a test cares about. */
export function createTestApp(overrides: Partial<AppDependencies> = {}): Express {
  return createApp({
    config: createConfig(),
    logger: createCapturedLogger().logger,
    tournaments: createInMemoryTournamentRepository([]),
    checkDatabase: () => Promise.resolve(),
    ...overrides,
  })
}
