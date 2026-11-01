import { randomUUID } from 'node:crypto'
import { trace } from '@opentelemetry/api'
import type { RequestHandler } from 'express'
import { callerOf } from './auth/caller.ts'
import { requestLogger, type Logger } from './logger.ts'

// Kept here too, so features import every request-logging helper from one place.
export { requestLogger }

export const requestIdHeader = 'x-request-id'

// Reuse an id from a caller or proxy only if it is short and plain. It goes into logs and headers.
const safeRequestId = /^[\w.-]{1,64}$/

// A path that carries a one-time secret. The emailed password-reset link puts its token in the path
// (stage 3, `GET /v1/auth/reset-password/:token`). Anyone who reads the log must not be able to use it.
// Express matches paths without regard to case and lets extra slashes through, so this does too.
const secretPathSegments = /^(\/+v1\/+auth\/+reset-password\/+)[^/?]+/i

/** A URL as it is safe to log: a token in the path is replaced by `[redacted]`. */
export function redactSecrets(path: string): string {
  return path.replace(secretPathSegments, '$1[redacted]')
}

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
      const path = redactSecrets(req.originalUrl).split('?')[0]
      requestLogger(res, logger)[levelFor(status, path)](
        {
          method: req.method,
          path,
          status,
          durationMs: Math.round(performance.now() - start),
          // Who called: the type only, never the key (D-95).
          callerType: callerOf(res).type,
          // The signed-in user's id (never the email), when there is one.
          userId: callerOf(res).user?.id,
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
