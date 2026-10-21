import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import type { RequestHandler } from 'express'
import type { RateLimitConfig } from '../config.ts'
import { HttpError } from './errors.ts'

// Some proxies, Azure among them, write the client as "1.2.3.4:51234" or "[2001:db8::1]:51234".
// The port changes with each connection, so a key that includes it never trips the limit.
const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/
const ipv6WithPort = /^\[([0-9a-fA-F:.]+)\]:\d+$/

/** One bucket per client. IPv6 clients share a bucket per /56 network, so one person cannot use many addresses. */
export function clientKey(ip: string): string {
  const address = ipv4WithPort.exec(ip)?.[1] ?? ipv6WithPort.exec(ip)?.[1] ?? ip
  return ipKeyGenerator(address)
}

/**
 * Fixed window per client IP, counted in memory. That is right for one server (the free App
 * Service plan); a scaled-out API needs a shared store such as Redis.
 *
 * A request over the limit gets a 429 through the error handler (body `{ message }`), with
 * `Retry-After` and `RateLimit` headers. `/health` never counts, so probes cannot lock out a deploy.
 */
export function createRateLimiter({ max, windowSeconds }: RateLimitConfig): RequestHandler {
  return rateLimit({
    limit: max,
    windowMs: windowSeconds * 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
    // Stryker disable next-line StringLiteral: unreachable, a live socket always has an address.
    keyGenerator: (req) => clientKey(req.ip ?? req.socket.remoteAddress ?? 'unknown'),
    // The library reads the function text for `ipKeyGenerator`. We call it inside clientKey.
    validate: { keyGeneratorIpFallback: false },
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'Too many requests. Try again later.'))
    },
  })
}
