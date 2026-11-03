import type { Meter } from '@opentelemetry/api'
import { toNodeHandler } from 'better-auth/node'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { Auth } from '../../shared/auth/createAuth.ts'
import { createAuthFailureCounter } from '../../shared/auth/authMetrics.ts'
import {
  createForgotLimiter,
  createResetLimiter,
  createSignInLimiter,
} from '../../shared/auth/signInLimit.ts'
import type { Logger } from '../../shared/logger.ts'
import { withDatabaseErrors } from '../../shared/database.ts'
import { HttpError } from '../../shared/errors.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { InviteMailer } from '../users/inviteMail.ts'
import { requestLogger } from '../../shared/requestLogging.ts'

// Stryker disable next-line MethodExpression: `toUpperCase` and `toLowerCase` give the same lookup, since Better Auth ignores case.
const forgotBody = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()) })
const forgotCooldownMs = 60_000

/**
 * Sign-in and sign-out, served by Better Auth (D-98). Only these two paths are open. Better Auth
 * has dozens more (change email, delete account, list sessions, impersonate), and none is wanted:
 * a path not listed here answers 404 from the app. Stage 3 adds the paths it needs, one at a
 * time.
 *
 * - `POST /v1/auth/sign-in/email`: body `{ email, password }`. 200 sets the session cookie and
 *   returns `{ user }`. A wrong password and an unknown email both answer 401 with the same
 *   message, so a caller cannot tell which emails exist.
 * - `POST /v1/auth/sign-out`: ends the session and clears the cookie.
 * - `POST /v1/auth/request-password-reset`: body `{ email }`. The forgot-password form calls it.
 *   Always 200 `{ status: true }` for a well-formed email, whether or not an account exists, and
 *   it does not wait for the mail, so neither the answer nor the timing shows who has one. If an
 *   account exists, they get a link to the set-password page. 503 when the API has no mail
 *   settings. Throttled to 5 requests per address per 15 minutes, and a second request for the
 *   same email within a minute sends nothing.
 * - `POST /v1/auth/reset-password`: body `{ newPassword, token }`. The set-password page calls it
 *   with the token from the invite email (D-101). 200 `{ status: true }` sets the password, uses
 *   up the token, and signs out the user's other sessions. A bad or used token, or a password
 *   outside 12 to 128 characters, is a 400. The token goes in the body only: one in the query
 *   string would reach request logs, so that is a 400 too. Refused calls are throttled like
 *   sign-in, apart from it.
 *
 * If the database cannot be reached, either path answers 503 `{ message: "Database unavailable" }`.
 *
 * Mount this before any `express.json()`: Better Auth reads the request body itself.
 */
export function createAuthRouter(
  auth: Auth,
  meter: Meter,
  logger: Logger,
  invites?: InviteMailer,
): Router {
  const router = Router()
  // Both answers can carry a session cookie or the user, so no cache may keep them.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  const betterAuth = toNodeHandler(auth)
  // A database that cannot be reached becomes the same 503 `Database unavailable` every route
  // gives (D-32). Any other unexpected failure is a generic 500 from the error handler.
  const handle: RequestHandler = (req, res) =>
    withDatabaseErrors(requestLogger(res, logger), () => betterAuth(req, res))
  const failures = createAuthFailureCounter(meter)

  router.post(
    '/sign-in/email',
    createSignInLimiter(meter),
    (_req, res, next) => {
      // After the response, so the status is known. The line names no email and no password.
      res.on('finish', () => {
        // Only a refused sign-in counts. A 5xx is our fault, and the request line already logs it.
        if (res.statusCode < 400 || res.statusCode >= 500) return
        failures.add(1, { reason: 'bad_sign_in' })
        requestLogger(res, logger).warn({ status: res.statusCode }, 'Sign-in failed')
      })
      next()
    },
    handle,
  )
  router.post('/sign-out', handle)

  const requested = new Map<string, number>()
  router.post('/request-password-reset', createForgotLimiter(meter), jsonBody, async (req, res) => {
    if (!invites) {
      throw new HttpError(503, 'Email is not set up on the server, so no link can be sent.')
    }
    const { email } = forgotBody.parse(req.body)
    const now = Date.now()
    for (const [known, at] of requested) if (now - at >= forgotCooldownMs) requested.delete(known)
    // The same answer either way: a repeat within the cooldown just sends nothing.
    if (!requested.has(email)) {
      requested.set(email, now)
      await withDatabaseErrors(requestLogger(res, logger), () =>
        auth.api.requestPasswordReset({ body: { email } }),
      )
    }
    res.json({ status: true })
  })

  router.post(
    '/reset-password',
    (req, _res, next) => {
      // Better Auth also reads `?token=`. A token in the URL would reach logs and traces.
      if (req.query['token'] !== undefined) {
        next(new HttpError(400, 'Send the token in the request body, not the address.'))
        return
      }
      next()
    },
    createResetLimiter(meter),
    (_req, res, next) => {
      res.on('finish', () => {
        if (res.statusCode < 400 || res.statusCode >= 500) return
        failures.add(1, { reason: 'bad_reset' })
        // No token, no user: a bad token could be a guess.
        requestLogger(res, logger).warn({ status: res.statusCode }, 'Set-password failed')
      })
      next()
    },
    handle,
  )
  return router
}
