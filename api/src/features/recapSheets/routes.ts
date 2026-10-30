import { Router } from 'express'
import { z } from 'zod'
import { loadLanePage, type FindSession, type LanePageDeps } from '../lanes/loadLanePage.ts'
import { buildRecapSheets } from './recapSheets.ts'

const params = z.object({ id: z.uuid(), sessionId: z.uuid() })

/**
 * Mounted at `/v1/tournaments/:id/squads/:sessionId/recap-sheets` and `/sweepers/:sessionId/recap-sheets`
 * (RPT-08). Web only, not part of the vendor contract (D-09). Public for 0.2.0; it moves behind
 * auth right after 0.3.0 (D-66, D-52). It reads the saved positions only (D-65). The lane route
 * logs the odd positions and skipped entries it finds, so this one adds no warning of its own.
 */
export function createRecapSheetRouter(
  kind: 'squad' | 'sweeper',
  findSession: FindSession,
  deps: LanePageDeps,
): Router {
  const router = Router({ mergeParams: true })
  const label = kind === 'squad' ? 'Squad' : 'Sweeper'

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id, sessionId } = params.parse(req.params)
    // The same checks as the lane page, in one place (LAN-02, D-56).
    const { session, page, skipped } = await loadLanePage(label, findSession, deps, id, sessionId)
    res.json(buildRecapSheets(page, session.games, skipped.length))
  })

  return router
}
