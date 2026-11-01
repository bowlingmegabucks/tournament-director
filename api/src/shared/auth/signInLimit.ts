import { rateLimit } from 'express-rate-limit'
import type { Meter } from '@opentelemetry/api'
import type { RequestHandler } from 'express'
import { HttpError } from '../errors.ts'
import { createAuthFailureCounter } from './authMetrics.ts'
import { clientKey } from '../rateLimit.ts'

/** Failed sign-ins one address may make in one window before it must wait. */
export const signInAttempts = 10
export const signInWindowMinutes = 15

/**
 * Slow down password guessing. Only a failed sign-in counts, so a desk full of people behind one
 * address can still sign in. A fixed window per client IP, in memory: right for one server (see
 * `createRateLimiter`). The address comes from Express (`TRUST_PROXY`), not from a header the
 * caller can set. Over the limit answers 429 through the error handler.
 */
export function createSignInLimiter(meter: Meter): RequestHandler {
  const failures = createAuthFailureCounter(meter)
  return rateLimit({
    limit: signInAttempts,
    windowMs: signInWindowMinutes * 60 * 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    // Stryker disable next-line StringLiteral: unreachable, a live socket always has an address.
    keyGenerator: (req) => clientKey(req.ip ?? req.socket.remoteAddress ?? 'unknown'),
    validate: { keyGeneratorIpFallback: false },
    handler: (_req, _res, next) => {
      failures.add(1, { reason: 'sign_in_throttled' })
      next(new HttpError(429, 'Too many sign-in attempts. Try again later.'))
    },
  })
}
