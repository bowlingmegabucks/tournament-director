import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import type { Router } from 'express'
import type { Logger } from '../../shared/logger.ts'
import {
  createSessionCompleteInfoRouter,
  createSessionCompleteRouter,
} from '../../shared/sessionCompleteRoutes.ts'
import type { SweeperWriter } from './writer.ts'

/** `POST /:sessionId/complete` of a sweeper (SQD-16, D-191 to D-193), behind `squads.write`. */
export function createSweeperCompleteRouter(
  writer: SweeperWriter,
  logger: Logger,
  events: SessionEvents,
): Router {
  return createSessionCompleteRouter(writer, logger, 'sweeper', events)
}

/** `GET /:sessionId/complete-info` of a sweeper (D-194), behind `squads.write`. */
export function createSweeperCompleteInfoRouter(writer: SweeperWriter): Router {
  return createSessionCompleteInfoRouter(writer, 'sweeper')
}
