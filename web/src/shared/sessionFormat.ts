// Display text for squads and sweepers (SQD-21, SQD-22). Both lists use it.

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}$/

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

/** "1 to 24 (24 lanes)", "Lane 5", or "Not set" for the legacy default of 0 (no lanes or no first lane). */
export function formatLanes(startingLane: number, numberOfLanes: number): string {
  if (numberOfLanes <= 0 || startingLane <= 0) return 'Not set'
  if (numberOfLanes === 1) return `Lane ${startingLane}`
  return `${startingLane} to ${startingLane + numberOfLanes - 1} (${numberOfLanes} lanes)`
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
