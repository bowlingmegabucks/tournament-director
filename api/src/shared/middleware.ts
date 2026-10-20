import type { ErrorRequestHandler, RequestHandler } from 'express'
import { HttpError } from './errors.ts'

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ message: 'Not found' })
}

// Express knows an error handler by its four parameters, so `_next` must stay.
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message })
    return
  }
  console.error(err)
  res.status(500).json({ message: 'Internal server error' })
}
