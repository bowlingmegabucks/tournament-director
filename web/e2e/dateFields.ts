import type { Page } from '@playwright/test'

/** Type a `YYYY-MM-DD` day into a date box the way the director does: `mm/dd/yyyy`. */
export async function fillDay(page: Page, label: string, day: string, exact = false) {
  const [year, month, date] = day.split('-')
  await page.getByLabel(label, { exact }).fill(`${month}/${date}/${year}`)
}

/** Fill the squad or sweeper form's date and time from `YYYY-MM-DDTHH:mm`. */
export async function fillDateTime(page: Page, value: string) {
  const [day = '', time = ''] = value.split('T')
  await fillDay(page, 'Date and time (required)', day)
  await page.getByLabel('Time', { exact: true }).fill(time)
}

/** `YYYY-MM-DDTHH:mm` on the tournament's first day. The demo dates move, so read the day from the form. */
export async function firstDayAt(page: Page, time: string): Promise<string> {
  const day = await page.getByLabel('Date and time (required)').getAttribute('data-first-day')
  if (!day) throw new Error('The date box has no first day')
  return `${day}T${time}`
}
