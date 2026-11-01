import { Router } from 'express'
import { callerOf, sentRejectedKey } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import type { Me } from './types.ts'

/**
 * `GET /v1/me` answers anyone, so a caller can check its key: a valid key gets `apiKey: true`,
 * no key gets `apiKey: false`, and a wrong key gets a 401 (API-17). Unlike other public routes,
 * which ignore a wrong key (D-95), this one says so. Later it tells the web app who is signed in.
 */
export function createMeRouter(): Router {
  const router = Router()
  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', (_req, res) => {
    if (sentRejectedKey(res)) throw new HttpError(401, 'Invalid API key.')
    const body: Me = { apiKey: callerOf(res).apiKey, user: null }
    // The answer depends on the caller, so no browser or proxy may reuse it.
    res.set('Cache-Control', 'no-store').json(body)
  })
  return router
}
