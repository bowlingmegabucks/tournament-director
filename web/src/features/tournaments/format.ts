// UTC, because the dates have no time zone and `new Date('2026-10-23')` is midnight UTC.
// The formatters are built per call, not at load: Stryker cannot test code that runs at import.
function dateFormat(withYear: boolean): Intl.DateTimeFormat {
  // Stryker disable next-line StringLiteral: '' falls back to the default locale, en-US here.
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  })
}

/** "Oct 23 to Oct 25, 2026"; "Dec 30, 2026 to Jan 2, 2027" across a year; "Oct 23, 2026" for one day. */
export function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (start === end) return dateFormat(true).format(startDate)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${dateFormat(!sameYear).format(startDate)} to ${dateFormat(true).format(endDate)}`
}

export function formatFee(fee: number): string {
  // Stryker disable next-line StringLiteral: '' falls back to the default locale, en-US here.
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(fee)
}
