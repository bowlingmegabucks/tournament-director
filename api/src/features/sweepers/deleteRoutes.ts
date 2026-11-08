import type { Router } from 'express'
import type { Logger } from '../../shared/logger.ts'
import {
  createSessionDeleteInfoRouter,
  createSessionDeleteRouter,
} from '../../shared/sessionDeleteRoutes.ts'
import type { SweeperWriter } from './writer.ts'

/** `DELETE /:sessionId` of a sweeper (SQD-14, D-186 to D-189), behind `squads.write`. */
export function createSweeperDeleteRouter(writer: SweeperWriter, logger: Logger): Router {
  return createSessionDeleteRouter(writer, logger, 'sweeper')
}

/** `GET /:sessionId/delete-info` of a sweeper (D-188), behind `squads.write`. */
export function createSweeperDeleteInfoRouter(writer: SweeperWriter): Router {
  return createSessionDeleteInfoRouter(writer, 'sweeper')
}
