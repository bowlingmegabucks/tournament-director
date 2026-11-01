import type { Meter } from '@opentelemetry/api'
import type { Express, RequestHandler, Router } from 'express'
import { createAuthFailureCounter, type AuthFailureReason } from './auth/authMetrics.ts'
import { callerOf, sentRejectedKey } from './auth/caller.ts'
import { isPermission, type Permission } from './auth/permissions.ts'
import { HttpError } from './errors.ts'

/**
 * Who may call a route group (D-27, D-96).
 * - `public`: anyone.
 * - `{ permission }`: a signed-in user who holds the permission (sign-in arrives in stage 2).
 * - `{ permission, apiKey: true }`: the same, and a valid API key gets in too, with no permission
 *   check. Only routes the registration site needs accept the key; it cannot reach the rest.
 *
 * The API enforces this on the server; the web app only hides what a user cannot use (D-19).
 */
export type Access = 'public' | { permission: Permission; apiKey?: boolean }

export interface RouteGroup {
  path: string
  access: Access
  router: Router
}

function isAccess(value: unknown): value is Access {
  if (value === 'public') return true
  if (typeof value !== 'object' || value === null || !('permission' in value)) return false
  const apiKey = 'apiKey' in value ? value.apiKey : undefined
  return isPermission(value.permission) && (apiKey === undefined || typeof apiKey === 'boolean')
}

/**
 * Every group declares its access (D-27). A group with none, or an unknown one, stops startup.
 * A protected group answers 401 when no one proved who they are, and 403 when the caller may not
 * call it: the API key on a route that does not accept it, or a user without the permission.
 * Each one adds to `tournament_director.auth.failures`, split by `reason`.
 */
export function mountRoutes(app: Express, groups: RouteGroup[], meter: Meter): void {
  const failures = createAuthFailureCounter(meter)
  const reject = (reason: AuthFailureReason, status: number, message: string): never => {
    failures.add(1, { reason })
    throw new HttpError(status, message)
  }

  for (const { path, access, router } of groups) {
    if (!isAccess(access)) {
      throw new Error(`Route group "${path}" needs an access label`)
    }
    if (access === 'public') {
      app.use(path, router)
      continue
    }
    const check: RequestHandler = (_req, res, next) => {
      const caller = callerOf(res)
      if (caller.type === 'anonymous') {
        reject(
          sentRejectedKey(res) ? 'invalid_key' : 'missing_credentials',
          401,
          'Missing or invalid credentials.',
        )
      }
      // The caller is the API key here: a valid key passes only where the route accepts it.
      // Sign-in (stage 2) adds users, who pass when they hold `access.permission`.
      if (access.apiKey !== true) {
        reject('forbidden', 403, 'You do not have permission to do this.')
      }
      next()
    }
    app.use(path, check, router)
  }
}
