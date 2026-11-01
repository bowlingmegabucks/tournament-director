import { createHash, timingSafeEqual } from 'node:crypto'
import { trace } from '@opentelemetry/api'
import type { RequestHandler, Response } from 'express'
import type { Permission } from './permissions.ts'

export const apiKeyHeader = 'x-api-key'

/** Who sent the request. Sign-in (stage 2) adds `user`. */
export type CallerType = 'anonymous' | 'apiKey'

export interface Caller {
  type: CallerType
  permissions: readonly Permission[]
}

const anonymous: Caller = { type: 'anonymous', permissions: [] }
// The key holds no permissions. A route that accepts it lets it in whole (D-96).
const apiKeyCaller: Caller = { type: 'apiKey', permissions: [] }

interface CallerState {
  caller: Caller
  /** A key came in and did not match. Public routes ignore it; protected ones answer 401 (D-95). */
  rejectedKey: boolean
}

// Keyed by the response, like HttpContext.Items in ASP.NET Core. Gone when the response is.
const states = new WeakMap<Response, CallerState>()

// Hash both sides first: timingSafeEqual needs equal lengths, and a hash hides the key's length.
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/**
 * Work out who is calling, once per request, before any route runs. A matching `x-api-key` makes
 * the caller the API key; no key makes it anonymous; a wrong key makes it anonymous and marked.
 * Like an ASP.NET Core authentication handler: it identifies, and the route's access label decides.
 */
export function identifyCaller(apiKey: string): RequestHandler {
  const expected = digest(apiKey)
  return (req, res, next) => {
    const sent = req.get(apiKeyHeader)
    const matches = sent !== undefined && timingSafeEqual(digest(sent), expected)
    const state: CallerState = {
      caller: matches ? apiKeyCaller : anonymous,
      rejectedKey: sent !== undefined && !matches,
    }
    states.set(res, state)
    trace.getActiveSpan()?.setAttribute('caller.type', state.caller.type)
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
