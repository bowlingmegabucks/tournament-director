import type { Router } from 'express'
import type { Logger } from '../../shared/logger.ts'
import {
  createSessionDeleteInfoRouter,
  createSessionDeleteRouter,
} from '../../shared/sessionDeleteRoutes.ts'
import type { SquadWriter } from './writer.ts'

/** `DELETE /:sessionId` of a squad (SQD-14, D-186 to D-189), behind `squads.write`. */
export function createSquadDeleteRouter(writer: SquadWriter, logger: Logger): Router {
  return createSessionDeleteRouter(writer, logger, 'squad')
}

/** `GET /:sessionId/delete-info` of a squad (D-188), behind `squads.write`. */
export function createSquadDeleteInfoRouter(writer: SquadWriter): Router {
  return createSessionDeleteInfoRouter(writer, 'squad')
}
