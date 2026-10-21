import type { ErrorRequestHandler, RequestHandler } from 'express'
import { HttpError } from './errors.ts'
import type { Logger } from './logger.ts'

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ message: 'Not found' })
}

// Express knows an error handler by its four parameters, so `_next` must stay.
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ message: err.message })
      return
    }
    // The cause goes to the log, never to the client.
    logger.error({ err }, 'Unhandled error')
    res.status(500).json({ message: 'Internal server error' })
  }
}
