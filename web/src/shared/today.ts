/** The browser's local date as `YYYY-MM-DD` (D-28). Dates in the API have no time zone. */
export function todayLocal(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
