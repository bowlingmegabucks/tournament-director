import express, { Router, type Request, type RequestHandler } from 'express'
import { APIError } from 'better-auth/api'
import { fromNodeHeaders } from 'better-auth/node'
import { randomBytes } from 'node:crypto'
import type { Auth } from '../../shared/auth/createAuth.ts'
import { callerOf } from '../../shared/auth/caller.ts'
import { roleNames, rolesOf } from '../../shared/auth/roles.ts'
import { withDatabaseErrors } from '../../shared/database.ts'
import { HttpError } from '../../shared/errors.ts'
import type { Logger } from '../../shared/logger.ts'
import { requestLogger } from '../../shared/requestLogging.ts'
import type { InviteMailer } from './inviteMail.ts'
import { z } from 'zod'
import {
  createUserSchema,
  updateUserSchema,
  type CreatedUser,
  type ListedUser,
  type UserOptions,
} from './types.ts'

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

const idParams = z.object({ id: z.string().min(1).max(64) })
/** More users than this cannot exist in practice (about five). A cap keeps the list bounded. */
const maxListed = 200

const duplicateEmail = 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'

function isDuplicateEmail(err: unknown): boolean {
  return err instanceof APIError && err.body?.code === duplicateEmail
}

interface StoredUser {
  id: string
  email: string
  name: string
  role?: string | null
  banned?: boolean | null
}

function listed(user: StoredUser): ListedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: rolesOf(user.role),
    disabled: user.banned === true,
  }
}

const lastAdminMessage = 'This would leave no enabled admin. Make another user an admin first.'

/**
 * Mounted at `/v1/users` behind `users.manage`: admins only, and the API key cannot reach it.
 * Web only, not part of the vendor contract.
 *
 * - `GET /options`: the roles to pick from and whether email is set up.
 * - `GET /`: every user, by name: `{ users: [{ id, email, name, roles, disabled }] }`.
 * - `POST /:id/disable` and `POST /:id/enable`: end or restore a user's access (204). Disabling
 *   ends their open sessions. Never deletes, so the history stays.
 * - `PATCH /:id`: body `{ roles }`, the full new set (at least one). 200 with the user. It reaches
 *   the user's next request.
 * - Disable refuses a user disabling themselves (409); edit refuses to take `admin` from the last
 *   enabled admin (409). Each change logs `actorId`, the admin who made it, and the affected `userId`.
 * - `POST /:id/password-reset`: emails the user a link to choose a new password. The admin never
 *   sees or sets a password (D-101). 204; 404 for an unknown id; 502 when the mail fails; 503
 *   without mail settings.
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

  const findUser = async (req: Request, id: string): Promise<StoredUser> => {
    const found = await auth.api
      .getUser({ query: { id }, headers: fromNodeHeaders(req.headers) })
      .catch((err: unknown) => {
        if (err instanceof APIError && err.statusCode === 404) return null
        throw err
      })
    if (!found) throw new HttpError(404, 'User not found.')
    return found
  }

  // Would this change leave the API with no enabled admin? Counts the others, so the target's
  // current state does not matter. (Two admins demoting each other at once could still slip past;
  // with about five users and one admin screen, that race is not worth a lock.)
  const othersAreEnabledAdmins = async (req: Request, id: string): Promise<boolean> => {
    const { users } = await auth.api.listUsers({
      query: { limit: maxListed },
      headers: fromNodeHeaders(req.headers),
    })
    return users.some(
      (user) => user.id !== id && user.banned !== true && rolesOf(user.role).includes('admin'),
    )
  }

  router.get('/options', (_req, res) => {
    const body: UserOptions = { roles: roleNames, inviteEmail: invites !== undefined }
    res.json(body)
  })

  router.get('/', async (req, res) => {
    const log = requestLogger(res, logger)
    const { users } = await withDatabaseErrors(log, () =>
      auth.api.listUsers({
        query: { sortBy: 'name', sortDirection: 'asc', limit: maxListed },
        headers: fromNodeHeaders(req.headers),
      }),
    )
    const body: { users: ListedUser[] } = {
      users: users.map(listed),
    }
    res.json(body)
  })

  router.post('/:id/disable', async (req, res) => {
    const { id } = idParams.parse(req.params)
    const actorId = callerOf(res).user?.id
    const log = requestLogger(res, logger)
    await withDatabaseErrors(log, async () => {
      await findUser(req, id)
      // Refusing self-disable is also the last-admin guard: the caller is an enabled admin, so any
      // other target leaves them standing.
      if (id === actorId) throw new HttpError(409, 'You cannot disable your own account.')
      await auth.api.banUser({ body: { userId: id }, headers: fromNodeHeaders(req.headers) })
    })
    log.info({ actorId, userId: id }, 'User disabled')
    res.status(204).end()
  })

  router.post('/:id/enable', async (req, res) => {
    const { id } = idParams.parse(req.params)
    const actorId = callerOf(res).user?.id
    const log = requestLogger(res, logger)
    await withDatabaseErrors(log, async () => {
      await findUser(req, id)
      await auth.api.unbanUser({ body: { userId: id }, headers: fromNodeHeaders(req.headers) })
    })
    log.info({ actorId, userId: id }, 'User enabled')
    res.status(204).end()
  })

  router.patch('/:id', jsonBody, async (req, res) => {
    const { id } = idParams.parse(req.params)
    const { roles } = updateUserSchema.parse(req.body)
    const actorId = callerOf(res).user?.id
    const log = requestLogger(res, logger)
    const updated = await withDatabaseErrors(log, async () => {
      const found = await findUser(req, id)
      if (
        found.banned !== true &&
        rolesOf(found.role).includes('admin') &&
        !roles.includes('admin') &&
        !(await othersAreEnabledAdmins(req, id))
      ) {
        throw new HttpError(409, lastAdminMessage)
      }
      await auth.api.setRole({
        body: { userId: id, role: roles },
        headers: fromNodeHeaders(req.headers),
      })
      return { ...found, role: roles.join(',') }
    })
    log.info({ actorId, userId: id, roles }, 'User roles changed')
    res.json(listed(updated))
  })

  router.post('/:id/password-reset', async (req, res) => {
    if (!invites) {
      throw new HttpError(503, 'Email is not set up on the server, so no link can be sent.')
    }
    const { id } = idParams.parse(req.params)
    const log = requestLogger(res, logger)
    await withDatabaseErrors(log, async () => {
      const found = await findUser(req, id)
      invites.expectAdminReset(found.email)
      await auth.api.requestPasswordReset({ body: { email: found.email } })
      if (invites.take(found.email) !== true) {
        throw new HttpError(
          502,
          'The reset email could not be sent. Check the mail settings and try again.',
        )
      }
    })
    log.info({ actorId: callerOf(res).user?.id, userId: id }, 'Password reset sent')
    res.status(204).end()
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

    log.info({ actorId: callerOf(res).user?.id, userId: created.id, roles }, 'User added')
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
