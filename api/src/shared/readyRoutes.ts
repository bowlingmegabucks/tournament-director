import { Router } from 'express'

/**
 * Readiness: can this instance do its work? `/health` says the process is up and never touches
 * the database, so a database outage does not restart the app (D-32). This route does ask it.
 */
export function createReadyRouter(checkDatabase: () => Promise<void>): Router {
  const router = Router()
  // Express 5 sends a rejected promise to the error handler: a down database gives its 503.
  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (_req, res) => {
    await checkDatabase()
    res.json({ status: 'ok' })
  })
  return router
}
