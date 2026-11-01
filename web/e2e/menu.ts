import { expect, type Page } from '@playwright/test'

/** The tournament sidebar. */
export const sidebar = (page: Page) => page.getByRole('navigation', { name: /Northeast MegaBuck/ })

/** On a phone the tournament menu starts closed: open it if it is shut, then follow the link. */
export async function menuLink(page: Page, name: string) {
  const nav = sidebar(page)
  const toggle = nav.getByRole('button', { name: 'Tournament menu' })
  await expect(nav).toBeVisible()
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click()
  }
  await nav.getByRole('link', { name }).click()
}

/**
 * Sign in as the seeded director through the form and end on the home page. The registrations and
 * lane pages need sign-in (D-52). The mock server forgets who signed in on a full page load, so
 * the test must move by links afterwards (see `openTournamentsSignedIn`).
 */
export async function signInAsDirector(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('director@example.com')
  await page.getByLabel('Password').fill('directorP4sswordLocal')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Tournament Management' })).toBeVisible()
}

/** Sign in as the director, then follow the Tournaments link, so the page keeps the sign-in. */
export async function openTournamentsSignedIn(page: Page) {
  await signInAsDirector(page)
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Tournaments' })
    .click()
}
