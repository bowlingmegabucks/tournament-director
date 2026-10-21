import type { EventEmitter } from 'node:events'
import type { Logger } from './logger.ts'

export interface ProcessEventDependencies {
  logger: Logger
  /** The HTTP server: `close` stops new connections and calls back once open requests end. */
  server: { close: (callback: () => void) => unknown }
  /** Send buffered telemetry. */
  flush: () => Promise<void>
  exit: (code: number) => void
  /** Give up and exit if shutdown takes longer than this. */
  forceExitMs: number
}

/**
 * Stop cleanly on SIGINT and SIGTERM (a deploy), and log a crash before dying.
 * Without this a crash prints a stack trace to stderr only, so it never reaches Seq or App Insights.
 * Pass `process` as the first argument.
 */
export function handleProcessEvents(
  events: Pick<EventEmitter, 'on'>,
  { logger, server, flush, exit, forceExitMs }: ProcessEventDependencies,
): void {
  let stopping = false
  let finishing = false
  let exitCode = 0

  function finish(): void {
    if (finishing) return
    finishing = true
    flush()
      .catch((err: unknown) => logger.error({ err }, 'Could not send telemetry'))
      .finally(() => exit(exitCode))
  }

  function stop(code: number): void {
    // A crash during a graceful shutdown still decides the exit code.
    exitCode = Math.max(exitCode, code)
    // After a crash, do not wait for open requests: the process state is unknown.
    if (code !== 0) finish()
    if (stopping) return
    stopping = true
    // unref: this timer alone must not keep the process alive.
    setTimeout(() => {
      logger.error({ forceExitMs }, 'Shutdown took too long, exiting')
      exit(1)
    }, forceExitMs).unref()
    server.close(finish)
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    events.on(signal, () => {
      logger.info({ signal }, 'Shutting down')
      stop(0)
    })
  }

  // After an uncaught error the process state is unknown. Log it, then exit; the host restarts it.
  events.on('uncaughtException', (err: unknown) => {
    logger.fatal({ err }, 'Uncaught exception')
    stop(1)
  })
  events.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection')
    stop(1)
  })
}
