import type { Express, Request, Response } from 'express'
import { createApp, type AppDependencies } from '../app.ts'
import { createConfig } from './factories.ts'
import { createCapturedLogger } from './logger.ts'
import type { RoleName } from '../shared/auth/roles.ts'
import { createTestAuth, createTestUser, signInCookie } from './testAuth.ts'
import { createInMemoryDivisionRepository } from '../features/divisions/repository.ts'
import { createInMemoryLaneRepository } from '../features/lanes/repository.ts'
import { createInMemoryRegistrationRepository } from '../features/registrations/repository.ts'
import { createInMemoryScoreRepository } from '../features/scores/repository.ts'
import { createInMemorySquadRepository } from '../features/squads/repository.ts'
import { createInMemorySweeperRepository } from '../features/sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../features/tournaments/repository.ts'

/** An app with in-memory storage, a database that always answers, and no CORS. Override only what a test cares about. */
export function createTestApp(overrides: Partial<AppDependencies> = {}): Express {
  return createApp({
    config: createConfig(),
    logger: createCapturedLogger().logger,
    auth: createTestAuth().auth,
    tournaments: createInMemoryTournamentRepository([]),
    divisions: createInMemoryDivisionRepository([]),
    registrations: createInMemoryRegistrationRepository([]),
    lanes: createInMemoryLaneRepository([]),
    scores: createInMemoryScoreRepository([]),
    squads: createInMemorySquadRepository([]),
    sweepers: createInMemorySweeperRepository([]),
    checkDatabase: () => Promise.resolve(),
    ...overrides,
  })
}

/**
 * The same app, with every request sent by a signed-in user who holds `role`. For the routes that
 * need a permission (D-52): a test of what the route returns need not sign in each time. Tests of
 * who may call a route use `createTestApp` and set the cookie or the key themselves.
 */
export function createSignedInTestApp(
  overrides: Partial<AppDependencies> = {},
  role: RoleName = 'director',
): Express {
  const { auth } = createTestAuth()
  const app = createTestApp({ ...overrides, auth })
  const cookie = createTestUser(auth, { role }).then(({ email }) => signInCookie(auth, email))
  // supertest takes any request handler, so wrap the app instead of changing each request.
  const handler = (req: Request, res: Response) => {
    void cookie.then((value) => {
      req.headers.cookie = value
      app(req, res)
    })
  }
  return handler as unknown as Express
}
