import { expect, test } from '@playwright/test'

async function signInAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('adminP4sswordLocal')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByText('Local Admin'),
  ).toBeVisible()
}

test('an admin adds a user from the menu', async ({ page }) => {
  await signInAsAdmin(page)

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Add user' })
    .click()
  await expect(page.getByRole('heading', { name: 'Add user', level: 1 })).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('Bea Bowler')
  await page.getByLabel('Email').fill('bea@example.com')
  await page.getByRole('button', { name: 'Add user' }).click()
  await expect(page.getByText('Pick at least one role.')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Score keeper' }).check()
  await page.getByRole('button', { name: 'Add user' }).click()

  await expect(page.getByText('Invite sent to bea@example.com.')).toBeVisible()
})

test('a signed-out visitor is sent to sign in', async ({ page }) => {
  await page.goto('/users/new')

  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
})

test('a new user follows the invite link and sets a password', async ({ page }) => {
  await page.goto('/set-password?token=abc')

  await page.getByLabel('New password').fill('a long enough password')
  await page.getByLabel('Confirm password').fill('a long enough password')
  await page.getByRole('button', { name: 'Set password' }).click()

  await expect(page.getByText('Your password is set.')).toBeVisible()
  await page.getByRole('link', { name: 'Go to sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
})

test('a user who forgot their password asks for a link', async ({ page }) => {
  await page.goto('/login')

  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await expect(page.getByRole('heading', { name: 'Forgot password', level: 1 })).toBeVisible()
  await page.getByLabel('Email').fill('bea@example.com')
  await page.getByRole('button', { name: 'Send link' }).click()

  await expect(page.getByText('If that address has an account')).toBeVisible()
})
