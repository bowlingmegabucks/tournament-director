import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { trace } from '@opentelemetry/api'
import { fromNodeHeaders } from 'better-auth/node'
import type { RequestHandler, Request, Response } from 'express'
import { requestLogger, type Logger } from '../logger.ts'
import type { Auth } from './createAuth.ts'
import type { Permission } from './permissions.ts'
import { permissionsOf, rolesOf, type RoleName } from './roles.ts'

export const apiKeyHeader = 'x-api-key'

/** Better Auth's session cookie always has this in its name, with or without a prefix. */
const sessionCookieMark = 'session_token'

/** A signed-in user, as the routes see them. Permissions come from the role table, not the database. */
export interface SignedInUser {
  id: string
  email: string
  name: string
  roles: RoleName[]
  permissions: Permission[]
}

export type CallerType = 'anonymous' | 'apiKey' | 'user' | 'apiKeyAndUser'

/**
 * Who sent the request. One request can carry both a valid API key and a sign-in (API-17). The key
 * holds no permissions; a route either accepts it whole or does not (D-96).
 */
export interface Caller {
  type: CallerType
  apiKey: boolean
  user: SignedInUser | null
}

function describeCaller(apiKey: boolean, user: SignedInUser | null): Caller {
  let type: CallerType
  if (apiKey && user) type = 'apiKeyAndUser'
  else if (apiKey) type = 'apiKey'
  else if (user) type = 'user'
  else type = 'anonymous'
  return { type, apiKey, user }
}

const anonymous = describeCaller(false, null)
const apiKeyCaller = describeCaller(true, null)

interface CallerState {
  caller: Caller
  /** A key came in and did not match. Public routes ignore it; protected ones answer 401 (D-95). */
  rejectedKey: boolean
  /** The request had a session cookie and the lookup failed (the database, say). Not the same as signed out. */
  sessionCheckFailed: boolean
}

// Keyed by the response, like HttpContext.Items in ASP.NET Core. Gone when the response is.
const states = new WeakMap<Response, CallerState>()

// A fresh random key per process. This is not password storage: the MAC only gives timingSafeEqual
// two buffers of equal length, and it hides the key's length. The key never leaves memory.
const macKey = randomBytes(32)

function digest(value: string): Buffer {
  return createHmac('sha256', macKey).update(value).digest()
}

// A user an admin has banned counts as signed out at once, even if a session row is left: someone
// who edits the `banned` column in SQL (before the user screens exist) sees it take effect.
function isBanned(user: { banned?: boolean | null; banExpires?: Date | null }): boolean {
  if (user.banned !== true) return false
  return user.banExpires == null || user.banExpires.getTime() > Date.now()
}

interface SessionResult {
  user: SignedInUser | null
  failed: boolean
}

/**
 * Find the user behind the session cookie. A request with no session cookie costs nothing: most
 * visitors are public viewers. Better Auth renews a session used after an hour, and says so with a
 * fresh `Set-Cookie`; we pass that on, or the browser would drop the cookie at hour 12 anyway.
 * The same goes for the cookie it clears when a session is gone.
 */
async function readSession(
  auth: Auth,
  req: Request,
  res: Response,
  logger: Logger,
): Promise<SessionResult> {
  const cookie = req.headers.cookie
  if (!cookie?.includes(sessionCookieMark)) return { user: null, failed: false }
  try {
    const { headers, response } = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
    })
    const found = response?.user
    // A banned user gets no renewed cookie. A cleared one (no session found) still goes out.
    if (found && isBanned(found)) return { user: null, failed: false }
    for (const cookie of headers.getSetCookie()) res.append('Set-Cookie', cookie)
    if (!found) return { user: null, failed: false }
    return {
      user: {
        id: found.id,
        email: found.email,
        name: found.name,
        roles: rolesOf(found.role),
        permissions: permissionsOf(found.role),
      },
      failed: false,
    }
  } catch (error) {
    requestLogger(res, logger).warn({ err: error }, 'Could not check the session')
    return { user: null, failed: true }
  }
}

export interface IdentifyCallerDependencies {
  /** The key the registration site sends (D-95). */
  apiKey: string
  auth: Auth
  logger: Logger
}

/**
 * Work out who is calling, once per request, before any route runs. A matching `x-api-key` makes
 * the caller the API key; a session cookie makes it a user; both can be true at once. A wrong key
 * is remembered, not held against a user who is allowed in. Like an ASP.NET Core authentication
 * handler: it identifies, and the route's access label decides.
 */
export function identifyCaller({
  apiKey,
  auth,
  logger,
}: IdentifyCallerDependencies): RequestHandler {
  const expected = digest(apiKey)
  return async (req, res, next) => {
    const sent = req.get(apiKeyHeader)
    const keyMatches = sent !== undefined && timingSafeEqual(digest(sent), expected)
    const session = await readSession(auth, req, res, logger)
    let caller: Caller
    if (session.user) caller = describeCaller(keyMatches, session.user)
    else if (keyMatches) caller = apiKeyCaller
    else caller = anonymous
    states.set(res, {
      caller,
      rejectedKey: sent !== undefined && !keyMatches,
      sessionCheckFailed: session.failed,
    })
    const span = trace.getActiveSpan()
    span?.setAttribute('caller.type', caller.type)
    if (caller.user) span?.setAttribute('enduser.id', caller.user.id)
    next()
  }
}

/** The caller for this request. Anonymous when `identifyCaller` has not run. */
export function callerOf(res: Response): Caller {
  return states.get(res)?.caller ?? anonymous
}

/** Whether this request sent an `x-api-key` that did not match. */
export function sentRejectedKey(res: Response): boolean {
  return states.get(res)?.rejectedKey ?? false
}

/** Whether the session lookup failed, so "no user" may mean "could not tell". */
export function sessionCheckFailed(res: Response): boolean {
  return states.get(res)?.sessionCheckFailed ?? false
}
