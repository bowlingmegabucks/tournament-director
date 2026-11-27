import { maxNoteLength } from '../payouts/types.ts'

/** `2026-11-26T08:00:00` as `11/26 8:00 AM`. The stored time is the center's own. */
export function shortSessionTime(date: string): string {
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  const hour = Number(date.slice(11, 13))
  const minute = date.slice(14, 16)
  const half = hour < 12 ? 'AM' : 'PM'
  return `${month}/${day} ${hour % 12 || 12}:${minute} ${half}`
}

/** The note the system writes on a payout whose bowler no longer earns it (NSH-11). */
export function systemNote(bowlerName: string, sourceDate: string, targetDate: string | null) {
  const from = shortSessionTime(sourceDate)
  const text =
    targetDate === null
      ? `${bowlerName} refunded from the ${from} squad after completion.`
      : `${bowlerName} moved from the ${from} squad to the ${shortSessionTime(targetDate)} squad after completion.`
  return text.slice(0, maxNoteLength)
}
