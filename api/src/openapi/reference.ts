import { randomBytes } from 'node:crypto'
import { apiReference } from '@scalar/express-api-reference'
import { Router } from 'express'

const cdn = 'https://cdn.jsdelivr.net'

/**
 * The page that shows the OpenAPI document (`GET /reference`). Scalar loads its script from a CDN
 * and starts it with an inline script, which helmet's default policy blocks. This page gets its own
 * policy: a fresh nonce for the inline script, the CDN for the bundle, and nothing else.
 */
export function createReferenceRouter(): Router {
  const router = Router()
  router.use((_req, res, next) => {
    const nonce = randomBytes(16).toString('base64')
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' ${cdn}`,
        `style-src 'self' 'unsafe-inline' ${cdn}`,
        `font-src 'self' data: ${cdn}`,
        "img-src 'self' data: https:",
        "connect-src 'self'",
      ].join('; '),
    )
    res.locals['scalarNonce'] = nonce
    next()
  })
  router.get('/', (req, res, next) => {
    const nonce = typeof res.locals['scalarNonce'] === 'string' ? res.locals['scalarNonce'] : ''
    // The package types its handler's `req` as `never`, so it needs this cast to be called.
    const render = apiReference({
      url: '/openapi/v1.json',
      pageTitle: 'Northeast Megabuck Tournament API',
      nonce,
    })
    render(req as never, res, next)
  })
  return router
}
