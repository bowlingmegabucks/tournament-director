import { z } from 'zod'
import type { AverageStatus } from './inUse.ts'

/** The longest note a director may write (D-291). */
export const maxNoteLength = 500

/**
 * What `PUT .../average-check` takes (D-291). The numbers and the note are checked by the plan, so
 * each failure names its field (D-121); here only the shape is.
 */
export const checkBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('verify'), confirmWarnings: z.boolean().optional() }),
  z.object({
    action: z.literal('adjust'),
    average: z.unknown(),
    note: z.unknown(),
    confirmWarnings: z.boolean().optional(),
  }),
])

export type CheckBody = z.infer<typeof checkBodySchema>

/** One registration in a handicap division, as the Averages page reads it (AVG-02). */
export interface AverageRow {
  registrationId: string
  bowlerName: string
  divisionName: string
  usbcId: string
  /** The average the bowler gave (the checked row's own copy once a director checked it). */
  providedAverage: number | null
  status: AverageStatus
  /** The average handicap uses: the checked one, else the provided one (D-288). */
  averageInUse: number | null
  note: string | null
  /** The name of the user who checked it. */
  verifiedBy: string | null
  /** ISO time. */
  verifiedAt: string | null
}
