import { randomBytes } from 'node:crypto'
import { apiReference } from '@scalar/express-api-reference'
import { Router, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'

const cdn = 'https://cdn.jsdelivr.net'
/** The bundle Scalar's page loads. An exact version, so a new release cannot change what runs here. */
export const scalarBundle = `${cdn}/npm/@scalar/api-reference@1.77.0/dist/browser/standalone.js`

/**
 * The page that shows the OpenAPI document (`GET /reference`). Scalar loads its script from a CDN
 * and starts it with an inline script, which helmet's default policy blocks. This page keeps every
 * helmet default (`base-uri`, `object-src`, `frame-ancestors`, and the rest) and changes only what
 * Scalar needs: a fresh nonce for the inline scripts, and the one pinned bundle file for the script.
 */
export function createReferenceRouter(): Router {
  const router = Router()
  // One nonce for each response, keyed by the response object (helmet reads it back by response).
  const nonces = new WeakMap<object, string>()
  const nonceOf = (res: object): string => nonces.get(res) ?? ''
  router.use((_req, res, next) => {
    nonces.set(res, randomBytes(16).toString('base64'))
    next()
  })
  router.use(
    helmet.contentSecurityPolicy({
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", (_req, res) => `'nonce-${nonceOf(res)}'`, scalarBundle],
        'style-src': ["'self'", "'unsafe-inline'", cdn],
        'font-src': ["'self'", 'data:', cdn],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'"],
      },
    }),
  )
  router.get('/', (req, res, next) => {
    const render = apiReference({
      url: specUrl(req),
      pageTitle: 'Northeast Megabuck Tournament API',
      nonce: nonceOf(res),
      cdn: scalarBundle,
      // No analytics, and no `proxyUrl`: a "Try it" call carries the x-api-key and goes straight to
      // this API, never through a third party.
      telemetry: false,
    })
    callScalar(render, req, res, next)
  })
  return router
}

/**
 * The document's address relative to the page, so it works at `/reference` and behind the dev proxy
 * at `/api/reference` (the proxy strips the prefix, so the API cannot see it).
 */
export function specUrl(req: Pick<Request, 'originalUrl'>): string {
  const path = req.originalUrl.replace(/\?.*$/, '')
  return path.endsWith('/') ? '../openapi/v1.json' : 'openapi/v1.json'
}

/** The package types its handler's `req` as `never`, so this is the one place that casts it. */
function callScalar(
  render: ReturnType<typeof apiReference>,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  render(req as never, res, next)
}
