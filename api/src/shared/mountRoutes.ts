import type { Meter } from '@opentelemetry/api'
import type { Express, RequestHandler, Router } from 'express'
import { createAuthFailureCounter, type AuthFailureReason } from './auth/authMetrics.ts'
import { callerOf, sentRejectedKey, sessionCheckFailed } from './auth/caller.ts'
import { isPermission, type Permission } from './auth/permissions.ts'
import { HttpError } from './errors.ts'

/**
 * Who may call a route group (D-27, D-96).
 * - `public`: anyone.
 * - `{ permission }`: a signed-in user whose roles hold the permission (roles.ts).
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
      // A signed-in user passes when their roles hold the permission. A wrong key sent beside a
      // good sign-in is ignored, as it is on a public route (D-95).
      if (caller.user?.permissions.includes(access.permission)) {
        next()
        return
      }
      // The API key passes only where the route accepts it, with no permission check (D-96).
      if (caller.apiKey && access.apiKey === true) {
        next()
        return
      }
      // Not enough to let them in. If we could not look up their session, say so rather than
      // call them signed out: a 503 tells the web app to retry, a 401 would send it to sign in.
      if (caller.user === null && sessionCheckFailed(res)) {
        throw new HttpError(503, 'Sign-in could not be checked. Try again.')
      }
      if (caller.user === null && !caller.apiKey) {
        reject(
          sentRejectedKey(res) ? 'invalid_key' : 'missing_credentials',
          401,
          'Missing or invalid credentials.',
        )
      }
      // Someone we know, who may not do this: a user without the permission, or the API key on a
      // route that does not accept it.
      reject('forbidden', 403, 'You do not have permission to do this.')
    }
    app.use(path, check, router)
  }
}
