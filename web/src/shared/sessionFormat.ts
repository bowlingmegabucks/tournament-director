// Display text for squads and sweepers (SQD-21, SQD-22). Both lists use it.

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}$/

/** True for the text the API sends as a session date: `2026-10-24T09:00:00`. */
export function isSessionDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_TIME.test(value)
}

/**
 * "Sat 10/24/2026 9:00 AM" from "2026-10-24T09:00:00". The API sends the center's local time with
 * no zone, so the digits are read as they are and the browser's zone never shifts them (D-44).
 */
export function formatSessionDate(value: string): string {
  const match = DATE_TIME.exec(value)
  if (!match) return value
  const [, year, month, day, hour, minute] = match
  const weekday = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  ).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  const hours = Number(hour)
  const clock = `${hours % 12 || 12}:${minute} ${hours < 12 ? 'AM' : 'PM'}`
  return `${weekday} ${month}/${day}/${year} ${clock}`
}

/**
 * "1 to 24 (24 lanes)", "Lane 5", or "Not set" for the legacy default of 0 lanes. A first lane of 0
 * (also a legacy default) leaves the count, which is still real: "12 lanes".
 */
export function formatLanes(startingLane: number, numberOfLanes: number): string {
  if (numberOfLanes <= 0) return 'Not set'
  const count = numberOfLanes === 1 ? '1 lane' : `${numberOfLanes} lanes`
  if (startingLane <= 0) return count
  if (numberOfLanes === 1) return `Lane ${startingLane}`
  return `${startingLane} to ${startingLane + numberOfLanes - 1} (${count})`
}

export function formatPerPair(maxPerPair: number): string {
  return `Up to ${maxPerPair}`
}

export function formatFee(fee: number): string {
  return `$${fee.toFixed(2)}`
}

/** "1 in 7.0": one in N advance or cash. */
export function formatRatio(ratio: number): string {
  return `1 in ${ratio.toFixed(1)}`
}

/** "+10" or "-5". The list leaves out 0 (D-45). */
export function formatPins(pins: number): string {
  return pins > 0 ? `+${pins}` : String(pins)
}

/** Mark a squad value that differs from the tournament's (D-43). */
export function withOverride(text: string, overridden: boolean): string {
  return overridden ? `${text} (override)` : text
}

/** "10/24/2026" from (printed sheets and reports: RPT-01, RPT-05) "2026-10-24T09:00:00". The digits are read as they are, with no time zone. */
export function formatSheetDate(value: string): string {
  const match = DATE_TIME.exec(value)
  if (!match) return value
  const [, year, month, day] = match
  return `${month}/${day}/${year}`
}

/** "09:00 AM" from "2026-10-24T09:00:00": two-digit hour, as legacy's `hh:mm tt`. */
export function formatSheetTime(value: string): string {
  const match = DATE_TIME.exec(value)
  if (!match) return value
  const [, , , , hour, minute] = match
  const hours = Number(hour)
  const clock = String(hours % 12 || 12).padStart(2, '0')
  return `${clock}:${minute} ${hours < 12 ? 'AM' : 'PM'}`
}
