// UTC, because the dates have no time zone and `new Date('2026-10-23')` is midnight UTC.
const monthDay = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})
const monthDayYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** "Oct 23 to Oct 25, 2026"; "Dec 30, 2026 to Jan 2, 2027" across a year; "Oct 23, 2026" for one day. */
export function formatDateRange(start: string, end: string): string {
  if (start === end) return monthDayYear.format(new Date(start))
  if (start.slice(0, 4) === end.slice(0, 4)) {
    return `${monthDay.format(new Date(start))} to ${monthDayYear.format(new Date(end))}`
  }
  return `${monthDayYear.format(new Date(start))} to ${monthDayYear.format(new Date(end))}`
}

export function formatFee(fee: number): string {
  return dollars.format(fee)
}
