import express, { type RequestHandler } from 'express'
import { HttpError } from './errors.ts'

/**
 * Reads a JSON body of at most 10 KB. A body that is not JSON, or is too large, is the caller's
 * mistake: a 400, not the app's generic 500.
 */
export const jsonBody: RequestHandler = (req, res, next) => {
  express.json({ limit: '10kb' })(req, res, (err?: unknown) => {
    next(err ? new HttpError(400, 'The request body is not valid JSON.') : undefined)
  })
}
