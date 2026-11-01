import { Router } from 'express'
import { callerOf } from '../../shared/auth/caller.ts'
import type { Me } from './types.ts'

/**
 * `GET /v1/me` answers anyone: a caller with no key, or a wrong one, is `anonymous` (D-95). It is
 * the ping for testing credentials, and later tells the web app what to show (D-96).
 */
export function createMeRouter(): Router {
  const router = Router()
  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', (_req, res) => {
    const { type, permissions } = callerOf(res)
    // Stryker disable next-line ArrayDeclaration: no caller holds a permission until sign-in (stage 2).
    const body: Me = { type, permissions: [...permissions] }
    // The answer depends on the caller, so no browser or proxy may reuse it.
    res.set('Cache-Control', 'no-store').json(body)
  })
  return router
}
