// Text on the printed sheet (RPT-05, RPT-05a).

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}$/

/** "10/24/2026" from "2026-10-24T09:00:00". The digits are read as they are, with no time zone. */
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

/** The handicap column: a dash when the handicap is 0 or less (RPT-05a). */
export function formatHandicap(handicap: number): string {
  return handicap > 0 ? String(handicap) : '-'
}

/** The Totals row: the handicap for every game, or a dash (RPT-05a). */
export function formatHandicapTotal(handicap: number, games: number): string {
  return handicap > 0 ? String(handicap * games) : '-'
}
