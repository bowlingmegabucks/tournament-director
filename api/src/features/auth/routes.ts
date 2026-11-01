import type { Meter } from '@opentelemetry/api'
import { toNodeHandler } from 'better-auth/node'
import { Router } from 'express'
import type { Auth } from '../../shared/auth/createAuth.ts'
import { createAuthFailureCounter } from '../../shared/auth/authMetrics.ts'
import { createSignInLimiter } from '../../shared/auth/signInLimit.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'

/**
 * Sign-in and sign-out, served by Better Auth (D-98). Only these two paths are open. Better Auth
 * has dozens more (change email, delete account, list sessions, impersonate), and none is wanted:
 * a path not listed here answers 404 from the app. Stage 3 adds the admin paths it needs, one at
 * a time.
 *
 * - `POST /v1/auth/sign-in/email`: body `{ email, password }`. 200 sets the session cookie and
 *   returns `{ user }`. A wrong password and an unknown email both answer 401 with the same
 *   message, so a caller cannot tell which emails exist.
 * - `POST /v1/auth/sign-out`: ends the session and clears the cookie.
 *
 * Mount this before any `express.json()`: Better Auth reads the request body itself.
 */
export function createAuthRouter(auth: Auth, meter: Meter, logger: Logger): Router {
  const router = Router()
  const handle = toNodeHandler(auth)
  const failures = createAuthFailureCounter(meter)

  router.post(
    '/sign-in/email',
    createSignInLimiter(meter),
    (_req, res, next) => {
      // After the response, so the status is known. The line names no email and no password.
      res.on('finish', () => {
        if (res.statusCode < 400) return
        failures.add(1, { reason: 'bad_sign_in' })
        requestLogger(res, logger).warn({ status: res.statusCode }, 'Sign-in failed')
      })
      next()
    },
    handle,
  )
  router.post('/sign-out', handle)
  return router
}
