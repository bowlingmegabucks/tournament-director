import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import type { Router } from 'express'
import type { Logger } from '../../shared/logger.ts'
import type { LiveNotifier } from '../results/liveEvents.ts'
import {
  createSessionCompleteInfoRouter,
  createSessionCompleteRouter,
  type UnverifiedCounter,
} from '../../shared/sessionCompleteRoutes.ts'
import type { SquadWriter } from './writer.ts'

/** `POST /:sessionId/complete` of a squad (SQD-15, D-190 to D-193), behind `squads.write`. */
export function createSquadCompleteRouter(
  writer: SquadWriter,
  logger: Logger,
  events: SessionEvents,
  live?: LiveNotifier,
  unverified?: UnverifiedCounter,
): Router {
  return createSessionCompleteRouter(writer, logger, 'squad', events, live, unverified)
}

/** `GET /:sessionId/complete-info` of a squad (D-194), behind `squads.write`. */
export function createSquadCompleteInfoRouter(
  writer: SquadWriter,
  unverified?: UnverifiedCounter,
): Router {
  return createSessionCompleteInfoRouter(writer, 'squad', unverified)
}
