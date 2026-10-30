import { z } from 'zod'
import { localDateTimeSchema } from '../../shared/sessions.ts'

/**
 * One recap sheet (RPT-05): a bowler with a saved lane, and the lane label for each game under
 * both skip patterns, so the desk can switch without a second request (D-64, D-65). `handicap` is
 * the handicap per game on a squad (SCR-07) and the bonus pins per game on a sweeper (SCR-09).
 * `web/src/features/recapSheets/types.ts` expects this shape. Change both together. Not
 * vendor-visible, and never the SSN, gender, birth date, address, email, phone, or payments
 * (BWL-17).
 */
export const recapSheetSchema = z.object({
  registrationId: z.uuid(),
  /** `First Last`, plus `, Suffix` (BWL-13). */
  name: z.string().min(1),
  divisionName: z.string(),
  /** The saved position, such as `1A`. */
  position: z.string().min(1),
  handicap: z.number().int(),
  cross: z.object({
    staggered: z.array(z.string().min(1)),
    same: z.array(z.string().min(1)),
  }),
})

export type RecapSheet = z.infer<typeof recapSheetSchema>

export const recapSheetsSchema = z.object({
  session: z.object({
    id: z.uuid(),
    kind: z.enum(['squad', 'sweeper']),
    date: localDateTimeSchema,
    games: z.number().int(),
    complete: z.boolean(),
  }),
  /** One per bowler with a saved lane, in lane order, then letter (LAN-04). */
  sheets: z.array(recapSheetSchema),
  /** Bowlers with no sheet: no lane yet, or a position outside the session's lanes (D-61, D-65). */
  withoutLane: z.number().int().nonnegative(),
  /** Bowlers with a lane whose division is not one of the tournament's, so they have no sheet (D-51). */
  withoutDivision: z.number().int().nonnegative(),
})

export type RecapSheets = z.infer<typeof recapSheetsSchema>
