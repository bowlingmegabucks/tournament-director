import { rateLimit } from 'express-rate-limit'
import type { Meter } from '@opentelemetry/api'
import type { RequestHandler } from 'express'
import { HttpError } from '../errors.ts'
import { createAuthFailureCounter, type AuthFailureReason } from './authMetrics.ts'
import { clientKey } from '../rateLimit.ts'

/** Failed sign-ins one address may make in one window before it must wait. */
export const signInAttempts = 10
export const signInWindowMinutes = 15

/**
 * Slow down password guessing. Only a refused sign-in (a 4xx) counts, so a desk full of people behind one
 * address can still sign in. A fixed window per client IP, in memory: right for one server (see
 * `createRateLimiter`). The address comes from Express (`TRUST_PROXY`), not from a header the
 * caller can set. Over the limit answers 429 through the error handler.
 */
export function createSignInLimiter(meter: Meter): RequestHandler {
  return createFailureLimiter(meter, {
    reason: 'sign_in_throttled',
    message: 'Too many sign-in attempts. Try again later.',
  })
}

/**
 * The same limit for a set-password call, which a guessed token would also abuse. It has its own
 * count, apart from sign-in, so one cannot lock out the other.
 */
export function createResetLimiter(meter: Meter): RequestHandler {
  return createFailureLimiter(meter, {
    reason: 'reset_throttled',
    message: 'Too many attempts to set a password. Try again later.',
  })
}

/** Forgot-password requests one address may make in one window. Each one can send an email. */
export const forgotAttempts = 5

/**
 * Stop someone using the forgot-password form to flood an inbox. Unlike the limiters above, every
 * request counts, not only refused ones: the answer is always the same, whoever has an account.
 */
export function createForgotLimiter(meter: Meter): RequestHandler {
  return createFailureLimiter(
    meter,
    {
      reason: 'forgot_throttled',
      message: 'Too many password reset requests. Try again later.',
    },
    { limit: forgotAttempts, countSuccesses: true },
  )
}

function createFailureLimiter(
  meter: Meter,
  { reason, message }: { reason: AuthFailureReason; message: string },
  { limit = signInAttempts, countSuccesses = false } = {},
): RequestHandler {
  const failures = createAuthFailureCounter(meter)
  return rateLimit({
    limit,
    windowMs: signInWindowMinutes * 60 * 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: !countSuccesses,
    // A 5xx is our fault, not a wrong password, so it does not use up anyone's attempts.
    requestWasSuccessful: (_req, res) => res.statusCode < 400 || res.statusCode >= 500,
    // Stryker disable next-line StringLiteral: unreachable, a live socket always has an address.
    keyGenerator: (req) => clientKey(req.ip ?? req.socket.remoteAddress ?? 'unknown'),
    validate: { keyGeneratorIpFallback: false },
    handler: (_req, _res, next) => {
      failures.add(1, { reason })
      next(new HttpError(429, message))
    },
  })
}
