import { z } from 'zod'
import type { FieldErrors } from '../features/tournaments/createRequest.ts'

/**
 * The create rules a squad and a sweeper share (SQD-03 to SQD-07, SQD-10, D-168, D-169, D-171,
 * D-174): the date, the lanes, bowlers per pair, and the checks against the stored tournament.
 * Each feature adds its own money fields and its own subject word for the messages.
 */

// A blank box reaches the API as "", spaces, a missing key, or null. All mean "not set"; the form
// trims the text the same way.
export const blankToNull = (value: unknown) =>
  value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value

// Wrong type or missing: the same words the form uses, so the two never disagree.
export const missing = (value: unknown) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

/** A required number: missing and wrong type each have their own message. */
export function required(label: string) {
  return z.number({
    error: (issue) => (missing(issue.input) ? `${label} is required` : 'Enter a number'),
  })
}

export function whole(label: string) {
  return required(label).refine((value) => Number.isInteger(value), { error: 'Enter a whole number' })
}

// Stryker disable next-line Regex: without `^` a prefixed value fails the round trip in `toLocalDateTime` all the same.
const dateTimeShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00(?:\.0+)?)?$/

/** `YYYY-MM-DDTHH:mm`, with seconds only as `00`, and a real calendar day and time. */
function toLocalDateTime(value: string): string | undefined {
  if (!dateTimeShape.test(value)) return undefined
  const minute = value.slice(0, 16)
  const parsed = new Date(`${minute}:00Z`)
  // 2026-02-30 rolls over to March in `Date`; the round trip catches that.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 16) !== minute) {
    return undefined
  }
  return `${minute}:00`
}

/** The rule for each shared field (D-168, D-169). Refused, never rounded (D-125). */
export const sessionFields = {
  date: z
    .string({
      error: (issue) =>
        missing(issue.input) ? 'Date and time is required' : 'Enter a date and time',
    })
    // An empty string is "missing" to the error function above, so it gives the message.
    .min(1)
    .transform((value, ctx) => {
      const normal = toLocalDateTime(value)
      if (normal === undefined) {
        ctx.addIssue({ code: 'custom', message: 'Enter a date and time' })
        return z.NEVER
      }
      return normal
    }),
  startingLane: whole('Starting lane')
    .refine((value) => value >= 1 && value <= 199, {
      error: 'Starting lane must be between 1 and 199',
    })
    .refine((value) => value % 2 === 1, { error: 'Starting lane must be odd' }),
  numberOfLanes: whole('Number of lanes')
    .refine((value) => value >= 2 && value <= 200, {
      error: 'Number of lanes must be between 2 and 200',
    })
    .refine((value) => value % 2 === 0, { error: 'Number of lanes must be even' }),
  maxPerPair: whole('Max per pair').refine((value) => value >= 2 && value <= 5, {
    error: 'Max per pair must be between 2 and 5',
  }),
}

export const lastLane = 200
export const laneBlockMessage = `Lanes must end at lane ${lastLane} or lower`

/**
 * The lanes run from the starting lane for the number of lanes, so the last one must exist (D-179).
 * Each field has its own range; this is the check across the two. Add it to the create schema with
 * `superRefine`. It skips a value another check already refused.
 */
export function checkLaneBlock(
  value: { startingLane: unknown; numberOfLanes: unknown },
  ctx: z.RefinementCtx,
): void {
  const { startingLane, numberOfLanes } = value
  if (typeof startingLane !== 'number' || typeof numberOfLanes !== 'number') return
  if (startingLane + numberOfLanes - 1 > lastLane) {
    ctx.addIssue({ code: 'custom', path: ['numberOfLanes'], message: laneBlockMessage })
  }
}

export const completeMessage = 'This tournament is complete and cannot be changed'

/** What the shared checks look at, read inside the save transaction. */
export interface SessionFacts {
  completed: boolean
  /** `YYYY-MM-DD` */
  startDate: string
  /** `YYYY-MM-DD` */
  endDate: string
}

export const beforeStartMessage = (subject: string) =>
  `${subject} date must be after tournament start`
export const afterEndMessage = (subject: string) => `${subject} date must be before tournament end`

/**
 * Refusals that cannot be confirmed away (D-129): a complete tournament, then a date outside the
 * tournament (SQD-03, D-169, D-171). The date counts from 00:00 on the start day to the end of the
 * end day, so comparing the day is enough. `undefined` means go on.
 */
export function refuseSession(
  facts: SessionFacts,
  date: string,
  subject: string,
): FieldErrors | undefined {
  if (facts.completed) return { tournament: completeMessage }
  const day = date.slice(0, 10)
  if (day < facts.startDate) return { date: beforeStartMessage(subject) }
  if (day > facts.endDate) return { date: afterEndMessage(subject) }
  return undefined
}
