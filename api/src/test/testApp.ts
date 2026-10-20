import type { Express } from 'express'
import { createApp, type AppDependencies } from '../app.ts'
import { createInMemoryTournamentRepository } from '../features/tournaments/repository.ts'

/** An app with in-memory storage and no CORS. Override only what a test cares about. */
export function createTestApp(overrides: Partial<AppDependencies> = {}): Express {
  return createApp({
    config: { port: 0, corsOrigins: [] },
    tournaments: createInMemoryTournamentRepository([]),
    ...overrides,
  })
}
