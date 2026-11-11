import { expect, type Page } from '@playwright/test'
import { tournament } from '../data/tournament'
import { mainMenu } from './signIn'

/** From any signed-in page: Tournaments, then the run's tournament, then a sidebar link. */
export async function openTournamentPage(page: Page, link?: string) {
  await mainMenu(page).getByRole('link', { name: 'Tournaments' }).click()
  await page.getByRole('article').filter({ hasText: tournament.name }).getByRole('link').click()
  await expect(page.getByRole('heading', { name: tournament.name, level: 1 })).toBeVisible()
  if (link) {
    await page
      .getByRole('navigation', { name: tournament.name })
      .getByRole('link', { name: link })
      .click()
  }
}
