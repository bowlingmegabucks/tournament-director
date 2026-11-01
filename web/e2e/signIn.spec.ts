import { expect, test } from '@playwright/test'

// The quick-login buttons are development only, so e2e (a build) signs in by typing.
test('a user signs in, sees their name, and signs out', async ({ page }) => {
  await page.goto('/')
  const mainMenu = page.getByRole('navigation', { name: 'Main' })

  await mainMenu.getByRole('link', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: /Log in as/ })).toHaveCount(0)

  await page.getByLabel('Email').fill('director@example.com')
  await page.getByLabel('Password').fill('directorP4sswordLocal')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Tournament Management' })).toBeVisible()
  await expect(mainMenu.getByText('Local Director')).toBeVisible()
  await expect(mainMenu.getByRole('link', { name: 'Sign in' })).toHaveCount(0)

  await mainMenu.getByRole('button', { name: 'Sign out' }).click()

  await expect(mainMenu.getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(mainMenu.getByText('Local Director')).toHaveCount(0)
})

test('a wrong password shows one error and stays on the page', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('Email').fill('director@example.com')
  await page.getByLabel('Password').fill('nope')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toHaveText('Email or password is wrong.')
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
})
