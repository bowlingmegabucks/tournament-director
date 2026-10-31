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
