import type { Router } from 'express'
import type { Logger } from '../../shared/logger.ts'
import {
  createSessionCompleteInfoRouter,
  createSessionCompleteRouter,
} from '../../shared/sessionCompleteRoutes.ts'
import type { SquadWriter } from './writer.ts'

/** `POST /:sessionId/complete` of a squad (SQD-15, D-190 to D-193), behind `squads.write`. */
export function createSquadCompleteRouter(writer: SquadWriter, logger: Logger): Router {
  return createSessionCompleteRouter(writer, logger, 'squad')
}

/** `GET /:sessionId/complete-info` of a squad (D-194), behind `squads.write`. */
export function createSquadCompleteInfoRouter(writer: SquadWriter): Router {
  return createSessionCompleteInfoRouter(writer, 'squad')
}
