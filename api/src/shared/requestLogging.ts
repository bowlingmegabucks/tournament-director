import { randomUUID } from 'node:crypto'
import { trace } from '@opentelemetry/api'
import type { RequestHandler, Response } from 'express'
import type { Logger } from './logger.ts'

export const requestIdHeader = 'x-request-id'

// Reuse an id from a caller or proxy only if it is short and plain. It goes into logs and headers.
const safeRequestId = /^[\w.-]{1,64}$/

/** Health probes run every few seconds, so their lines only show at debug level. */
const quietPath = '/health'

/**
 * Give every request an id and log one line when it ends.
 *
 * The id comes from the `x-request-id` header or is new, goes back in the response header, and
 * sits on the active trace span. Handlers get a logger that carries the id (`requestLogger`).
 * Like ASP.NET Core: a logging scope with the correlation id, plus request logging middleware.
 */
export function requestLogging(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get(requestIdHeader)
    const requestId =
      incoming !== undefined && safeRequestId.test(incoming) ? incoming : randomUUID()
    const start = performance.now()

    res.setHeader(requestIdHeader, requestId)
    trace.getActiveSpan()?.setAttribute('request.id', requestId)
    res.locals['logger'] = logger.child({ requestId })

    res.on('close', () => {
      const status = res.statusCode
      // Path only. A query string can hold personal data.
      const path = req.originalUrl.split('?')[0]
      requestLogger(res, logger)[levelFor(status, path)](
        {
          method: req.method,
          path,
          status,
          durationMs: Math.round(performance.now() - start),
          // The caller hung up before we finished.
          aborted: !res.writableFinished,
        },
        'Request completed',
      )
    })

    next()
  }
}

function levelFor(status: number, path: string | undefined): 'error' | 'warn' | 'debug' | 'info' {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  return path === quietPath ? 'debug' : 'info'
}

/** The logger for this request (it carries `requestId`), or `fallback` outside a request. */
export function requestLogger(res: Response, fallback: Logger): Logger {
  const logger: unknown = res.locals['logger']
  return isLogger(logger) ? logger : fallback
}

function isLogger(value: unknown): value is Logger {
  return typeof value === 'object' && value !== null && 'child' in value && 'info' in value
}
