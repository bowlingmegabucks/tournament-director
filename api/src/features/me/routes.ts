import { Router } from 'express'
import { callerOf, sentRejectedKey, sessionCheckFailed } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import type { Me } from './types.ts'

/**
 * `GET /v1/me` answers anyone: who is calling, and what they may do (API-17).
 * - `apiKey`: whether the request carried a valid key, so a caller can check its key.
 * - `user`: the signed-in user with their roles and permissions, or `null`. The web app asks this
 *   to decide what to show (D-102) and never keeps its own list of permissions (D-96).
 * - A wrong key gets a 401. Other public routes ignore a wrong key (D-95); this one says so.
 * - If the session lookup failed (the database, say), a 503 and not `user: null`: the web app must
 *   not mistake an outage for being signed out.
 * Nothing here is cached: the answer depends on who asks.
 */
export function createMeRouter(): Router {
  const router = Router()
  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store')
    if (sentRejectedKey(res)) throw new HttpError(401, 'Invalid API key.')
    if (sessionCheckFailed(res)) {
      throw new HttpError(503, 'Sign-in could not be checked. Try again.')
    }
    const { apiKey, user } = callerOf(res)
    // Named field by field, so a field added to the caller later is not sent by accident.
    const body: Me = {
      apiKey,
      user: user && {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        permissions: user.permissions,
      },
    }
    res.json(body)
  })
  return router
}
