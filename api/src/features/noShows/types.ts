import { z } from 'zod'
import { localDateTimeSchema } from '../../shared/sessions.ts'

/**
 * Moving or refunding a no-show after a squad is complete (NSH-01 to NSH-14).
 * `web/src/features/noShows/types.ts` expects these shapes. Change both together. Web only.
 */

/** One squad entry, as the "Keep advancing" box names it (NSH-20). */
export const entryKeySchema = z.strictObject({ squadId: z.uuid(), registrationId: z.uuid() })

export type EntryKey = z.infer<typeof entryKeySchema>

const choiceFields = {
  keepAdvancing: z.array(entryKeySchema).max(100).default([]),
}

const choiceSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('move'), targetSquadId: z.uuid(), ...choiceFields }),
  z.strictObject({ action: z.literal('refund'), ...choiceFields }),
])

export const previewRequestSchema = choiceSchema

export const applyRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('move'),
    targetSquadId: z.uuid(),
    version: z.string().min(1),
    ...choiceFields,
  }),
  z.strictObject({ action: z.literal('refund'), version: z.string().min(1), ...choiceFields }),
])

export type Choice = z.infer<typeof choiceSchema>

const sessionRefSchema = z.object({ id: z.uuid(), date: localDateTimeSchema })

/** A bowler in one squad, as a change or a checkbox names them. */
const bowlerInSquadSchema = z.object({
  squadId: z.uuid(),
  squadDate: localDateTimeSchema,
  divisionName: z.string(),
  registrationId: z.uuid(),
  name: z.string(),
})

export const changeKinds = ['losesAdvance', 'gainsAdvance', 'losesCash', 'gainsCash'] as const

export const squadChangeSchema = bowlerInSquadSchema.extend({ change: z.enum(changeKinds) })

export const keepChoiceSchema = bowlerInSquadSchema.extend({ kept: z.boolean() })

export const atLargeChangeSchema = z.object({
  divisionId: z.uuid(),
  divisionName: z.string(),
  spotsBefore: z.number().int().nonnegative(),
  spotsAfter: z.number().int().nonnegative(),
  /** Names of the bowlers who take, or lose, an at-large spot. */
  joins: z.array(z.string()),
  leaves: z.array(z.string()),
})

export const payoutChangeSchema = z.object({
  payoutId: z.uuid(),
  /** `Squad 11/26 8:00 AM` or `Finals: Open`. */
  label: z.string(),
  name: z.string(),
  /** Money text. The amount never changes (NSH-10). */
  amount: z.string(),
  /** The note the system will write, or `null` when the payout keeps the one it has (NSH-11). */
  note: z.string().nullable(),
})

export const previewSchema = z.object({
  action: z.enum(['move', 'refund']),
  bowlerName: z.string(),
  source: sessionRefSchema,
  target: sessionRefSchema.nullable(),
  /** The refund removes their only squad entry, so the registration goes (NSH-06). */
  deletesRegistration: z.boolean(),
  warnings: z.array(z.string()),
  changes: z.array(squadChangeSchema),
  keepAdvancing: z.array(keepChoiceSchema),
  atLarge: z.array(atLargeChangeSchema),
  payouts: z.array(payoutChangeSchema),
  /** Changes when anything above would. Sent back with the save. */
  version: z.string(),
})

export type Preview = z.infer<typeof previewSchema>
export type SquadChange = z.infer<typeof squadChangeSchema>
export type KeepChoice = z.infer<typeof keepChoiceSchema>
export type AtLargeChange = z.infer<typeof atLargeChangeSchema>
export type PayoutChange = z.infer<typeof payoutChangeSchema>
