import { expect, type Page } from '@playwright/test'
import { tournament } from '../data/tournament'
import { mainMenu } from './signIn'

/** From any signed-in page: Tournaments, then the run's tournament, then a sidebar link. */
export async function openTournamentPage(
  page: Page,
  link?: string,
  name: string = tournament.name,
) {
  await mainMenu(page).getByRole('link', { name: 'Tournaments' }).click()
  await page.getByRole('article').filter({ hasText: name }).getByRole('link').click()
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
  if (link) {
    await page.getByRole('navigation', { name }).getByRole('link', { name: link }).click()
  }
}

/** A refused save leaves the form with its text in it, so the way out asks first: pick Leave. */
export async function leaveForm(page: Page) {
  await mainMenu(page).getByRole('link', { name: 'Tournaments' }).click()
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible()
  await page.getByRole('button', { name: 'Leave page' }).click()
}
