import express, { type RequestHandler } from 'express'
import { HttpError } from './errors.ts'

/**
 * Reads a JSON body of at most 10 KB. A body that is not JSON, or is too large, is the caller's
 * mistake: a 400, not the app's generic 500. The message says which.
 */
export const jsonBody: RequestHandler = (req, res, next) => {
  express.json({ limit: '10kb' })(req, res, (err?: unknown) => {
    if (!err) {
      next()
      return
    }
    const type = typeof err === 'object' && 'type' in err ? err.type : undefined
    next(
      new HttpError(
        400,
        type === 'entity.too.large'
          ? 'The request body is too large.'
          : 'The request body is not valid JSON.',
      ),
    )
  })
}
