import express, { Router, type RequestHandler } from 'express'
import { APIError } from 'better-auth/api'
import { fromNodeHeaders } from 'better-auth/node'
import { randomBytes } from 'node:crypto'
import type { Auth } from '../../shared/auth/createAuth.ts'
import { roleNames, rolesOf } from '../../shared/auth/roles.ts'
import { withDatabaseErrors } from '../../shared/database.ts'
import { HttpError } from '../../shared/errors.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { InviteMailer } from './inviteMail.ts'
import { createUserSchema, type CreatedUser, type UserOptions } from './types.ts'

export interface UserRouterDependencies {
  auth: Auth
  /** `undefined` when the API has no mail settings. Then no user can be added. */
  invites: InviteMailer | undefined
  logger: Logger
}

// A body that is not JSON is the caller's mistake: a 400, not the app's generic 500.
const jsonBody: RequestHandler = (req, res, next) => {
  express.json({ limit: '10kb' })(req, res, (err?: unknown) => {
    next(err ? new HttpError(400, 'The request body is not valid JSON.') : undefined)
  })
}

const duplicateEmail = 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'

function isDuplicateEmail(err: unknown): boolean {
  return err instanceof APIError && err.body?.code === duplicateEmail
}

/**
 * Mounted at `/v1/users` behind `users.manage`: admins only, and the API key cannot reach it.
 * Web only, not part of the vendor contract.
 *
 * - `GET /options`: the roles to pick from and whether email is set up.
 * - `POST /`: body `{ email, name, roles }`. Makes the user with a random password nobody sees, then
 *   emails a link where they choose their own (D-101). 201 with the user; 409 when the email is in
 *   use; 503 when the API has no mail settings (no one is added). If the mail fails, the user is
 *   removed again and the answer is 502, so a retry works.
 */
export function createUserRouter({ auth, invites, logger }: UserRouterDependencies): Router {
  const router = Router()
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/options', (_req, res) => {
    const body: UserOptions = { roles: roleNames, inviteEmail: invites !== undefined }
    res.json(body)
  })

  router.post('/', jsonBody, async (req, res) => {
    if (!invites) {
      throw new HttpError(503, 'Email is not set up on the server, so no invite can be sent.')
    }
    const { email, name, roles } = createUserSchema.parse(req.body)
    // The admin's own cookie: Better Auth checks again that the caller may add users and set roles.
    const headers = fromNodeHeaders(req.headers)
    const log = requestLogger(res, logger)

    // A password nobody sees: the invite replaces it. Random, and long enough for the rule.
    const password = randomBytes(32).toString('base64url')
    const addUser = async () => {
      try {
        const { user } = await auth.api.createUser({
          body: { email, name, password, role: roles },
          headers,
        })
        return user
      } catch (err) {
        if (isDuplicateEmail(err))
          throw new HttpError(409, 'A user with this email already exists.')
        throw err
      }
    }

    const created = await withDatabaseErrors(log, async () => {
      const user = await addUser()
      invites.expectInvite(email)
      await auth.api.requestPasswordReset({ body: { email } })
      if (invites.take(email) === true) return user
      // The invite did not go out. Take the user back, so the admin can fix the mail and retry.
      try {
        await auth.api.removeUser({ body: { userId: user.id }, headers })
      } catch (err) {
        log.error({ err, userId: user.id }, 'Could not remove a user whose invite failed')
        throw new HttpError(
          502,
          'The user was added, but the invite email failed and the user could not be removed. Ask a developer.',
        )
      }
      throw new HttpError(
        502,
        'The invite email could not be sent, so the user was not added. Try again.',
      )
    })

    log.info({ userId: created.id, roles }, 'User added')
    const body: CreatedUser = {
      id: created.id,
      email: created.email,
      name: created.name,
      roles: rolesOf(created.role),
    }
    res.status(201).json(body)
  })

  return router
}
