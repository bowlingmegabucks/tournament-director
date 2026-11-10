import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import type { Meter } from '@opentelemetry/api'
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
 * The live score routes (D-232): the public scores page and its stream, score entry, and the skip.
 * Many phones watch these from one venue address, and a keeper saves often, so they count in their
 * own, larger bucket and never use up the general one.
 */
const livePath = /^\/v1\/tournaments\/[^/]+\/(?:squads|sweepers)\/[^/]+\/(?:scores(?:\/.*)?|skip)$/

export const isLivePath = (path: string) => livePath.test(path)

/**
 * Fixed window per client IP, counted in memory. That is right for one server (the free App
 * Service plan); a scaled-out API needs a shared store such as Redis.
 *
 * Two buckets (D-232): `max` for every route, and `liveMax` for the live score routes, which
 * `isLivePath` names. A request counts in one bucket only. A request over the limit gets a 429
 * through the error handler (body `{ message }`), with `Retry-After` and `RateLimit` headers.
 * `/health` never counts, so probes cannot lock out a deploy. Each rejection adds one to the
 * `tournament_director.rate_limit.rejections` metric.
 */
export function createRateLimiter(
  { max, liveMax, windowSeconds }: RateLimitConfig,
  meter: Meter,
): RequestHandler {
  const rejections = meter.createCounter('tournament_director.rate_limit.rejections', {
    description: 'Requests turned away with a 429 because the client went over the limit.',
    unit: '{request}',
  })

  const bucket = (limit: number, skip: (path: string) => boolean) =>
    rateLimit({
      limit,
      windowMs: windowSeconds * 1000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: (req) => skip(req.path),
      // Stryker disable next-line StringLiteral: unreachable, a live socket always has an address.
      keyGenerator: (req) => clientKey(req.ip ?? req.socket.remoteAddress ?? 'unknown'),
      // The library reads the function text for `ipKeyGenerator`. We call it inside clientKey.
      validate: { keyGeneratorIpFallback: false },
      handler: (_req, _res, next) => {
        rejections.add(1)
        next(new HttpError(429, 'Too many requests. Try again later.'))
      },
    })

  const general = bucket(max, (path) => path === '/health' || isLivePath(path))
  const live = bucket(liveMax, (path) => !isLivePath(path))
  return (req, res, next) => {
    general(req, res, (error?: unknown) => {
      if (error) next(error)
      else live(req, res, next)
    })
  }
}
