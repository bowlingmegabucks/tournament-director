import { expect, type Page } from '@playwright/test'

/** Sign in through the real login page (rule 9: no quick-login buttons) and wait for the menu. */
export async function signIn(page: Page, user: { email: string; name: string; password: string }) {
  // Whoever was signed in before is signed out, so /login always shows the form.
  await page.context().clearCookies()
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /Local (Admin|Director)/ })).toHaveCount(0)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByText(user.name)).toBeVisible()
}

export const mainMenu = (page: Page) => page.getByRole('navigation', { name: 'Main' })
