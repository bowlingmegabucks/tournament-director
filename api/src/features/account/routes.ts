import { Router } from 'express'
import { APIError } from 'better-auth/api'
import { fromNodeHeaders } from 'better-auth/node'
import type { Meter } from '@opentelemetry/api'
import type { Auth } from '../../shared/auth/createAuth.ts'
import { createAuthFailureCounter } from '../../shared/auth/authMetrics.ts'
import { callerOf } from '../../shared/auth/caller.ts'
import { createPasswordChangeLimiter } from '../../shared/auth/signInLimit.ts'
import { withDatabaseErrors } from '../../shared/database.ts'
import { HttpError } from '../../shared/errors.ts'
import { jsonBody } from '../../shared/jsonBody.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import { changePasswordSchema, updateProfileSchema, type Profile } from './types.ts'

export interface AccountRouterDependencies {
  auth: Auth
  meter: Meter
  logger: Logger
}

/**
 * Mounted at `/v1/account` for any signed-in user (`signedIn`). The API key cannot reach it. Web
 * only. Our own routes call Better Auth in the same process, so its `change-password` and
 * `update-user` paths stay closed and the body is only what we name here.
 *
 * - `POST /password`: body `{ currentPassword, newPassword }`. 204 sets the new password and ends
 *   the user's other sessions; this one stays signed in. A wrong current password is a 400 (not a
 *   401, which the web app reads as "signed out"). A new password equal to the old one is a 400.
 *   Wrong attempts are throttled to 10 per user per 15 minutes.
 * - `PATCH /`: body `{ name }`. 200 `{ name }`. Any other field is a 400, so a user cannot set
 *   their own role or disabled flag.
 *
 * Logs name the user id, never a password.
 */
export function createAccountRouter({ auth, meter, logger }: AccountRouterDependencies): Router {
  const router = Router()
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  const failures = createAuthFailureCounter(meter)

  router.post('/password', createPasswordChangeLimiter(meter), jsonBody, async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body)
    const log = requestLogger(res, logger)
    const userId = callerOf(res).user?.id
    if (currentPassword === newPassword) {
      throw new HttpError(400, 'Choose a password you have not used just now.')
    }
    const { headers } = await withDatabaseErrors(log, () =>
      auth.api
        .changePassword({
          body: { currentPassword, newPassword, revokeOtherSessions: true },
          headers: fromNodeHeaders(req.headers),
          returnHeaders: true,
        })
        .catch((err: unknown) => {
          if (err instanceof APIError && err.body?.code === 'INVALID_PASSWORD') {
            failures.add(1, { reason: 'bad_password_change' })
            log.warn({ userId }, 'Password change refused')
            throw new HttpError(400, 'The current password is wrong.')
          }
          throw err
        }),
    )
    // Changing the password ends every session and starts a new one for this browser. Pass its cookie on.
    for (const cookie of headers.getSetCookie()) res.append('Set-Cookie', cookie)
    log.info({ userId }, 'Password changed')
    res.status(204).end()
  })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.patch('/', jsonBody, async (req, res) => {
    const { name } = updateProfileSchema.parse(req.body)
    const log = requestLogger(res, logger)
    await withDatabaseErrors(log, () =>
      auth.api.updateUser({ body: { name }, headers: fromNodeHeaders(req.headers) }),
    )
    log.info({ userId: callerOf(res).user?.id }, 'Profile changed')
    const body: Profile = { name }
    res.json(body)
  })

  return router
}
