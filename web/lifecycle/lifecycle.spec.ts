import { expect, test } from '@playwright/test'
import { admin, director, scoreKeeper } from './data/people'
import { editedBowlingCenter, tournament } from './data/tournament'
import { createFirstAdmin } from './support/createAdmin'
import { inviteLinkIn, waitForMail } from './support/mail'
import { mainMenu, signIn } from './support/signIn'

// docs/plans/lifecycle-e2e.md. Stages run in order (rule 8): a failed stage skips the rest.
test.describe.configure({ mode: 'serial' })

test('stage 0: the first admin, then the other users through the add-user page', async ({
  page,
}) => {
  createFirstAdmin(admin)
  await signIn(page, admin)

  for (const person of [director, scoreKeeper]) {
    await mainMenu(page).getByRole('link', { name: 'Users' }).click()
    await page.getByRole('link', { name: 'Add user' }).click()
    await page.getByLabel('Name', { exact: true }).fill(person.name)
    await page.getByLabel('Email').fill(person.email)
    await page.getByRole('checkbox', { name: person.role }).check()
    await page.getByRole('button', { name: 'Add user' }).click()
    await expect(page.getByText(`Invite sent to ${person.email}.`)).toBeVisible()
  }

  // The invite lands in the mail catcher; the link sets the password (the set-password flow).
  for (const person of [director, scoreKeeper]) {
    await page.goto(inviteLinkIn(await waitForMail(person.email)))
    await page.getByLabel('New password').fill(person.password)
    await page.getByLabel('Confirm password').fill(person.password)
    await page.getByRole('button', { name: 'Set password' }).click()
    await expect(page.getByText('Your password is set.')).toBeVisible()
  }

  // Each new user signs in with the password they chose.
  await signIn(page, director)
})

test('stage 1: the director creates the tournament, edits a free field, and checks the overview', async ({
  page,
}) => {
  await signIn(page, director)
  await mainMenu(page).getByRole('link', { name: 'Tournaments' }).click()
  await page.getByRole('link', { name: 'New tournament' }).click()

  await page.getByLabel('Name (required)', { exact: true }).fill(tournament.name)
  await page.getByLabel('Start date (required)', { exact: true }).fill(tournament.start)
  await page.getByLabel('End date (required)', { exact: true }).fill(tournament.end)
  await page.getByLabel('Bowling center (required)', { exact: true }).fill(tournament.bowlingCenter)
  await page
    .getByLabel('Entry fee in dollars (required)', { exact: true })
    .fill(tournament.entryFee)
  await page.getByLabel('Games per squad (required)', { exact: true }).fill(tournament.games)
  await page.getByLabel('Finals ratio (required)', { exact: true }).fill(tournament.finalsRatio)
  await page.getByLabel('Cash ratio (required)', { exact: true }).fill(tournament.cashRatio)
  await page
    .getByLabel('Super sweeper cash ratio (required)', { exact: true })
    .fill(tournament.superSweeperCashRatio)
  await page.getByRole('button', { name: 'Save tournament' }).click()

  await expect(page.getByRole('heading', { name: tournament.name, level: 1 })).toBeVisible()
  await expect(page.getByText('Games per squad').locator('+ dd')).toHaveText(tournament.games)
  await expect(page.getByText('Finals ratio').locator('+ dd')).toHaveText('1 in 7.5')
  await expect(page.getByText('Cash ratio', { exact: true }).locator('+ dd')).toHaveText('1 in 4.5')
  await expect(page.getByText('Super sweeper cash ratio').locator('+ dd')).toHaveText('1 in 3')

  await page.getByRole('link', { name: 'Edit tournament' }).click()
  await page.getByLabel('Bowling center (required)', { exact: true }).fill(editedBowlingCenter)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Tournament saved')).toBeVisible()
  await expect(page.getByText('Bowling center').locator('+ dd')).toHaveText(editedBowlingCenter)

  // Exactly one tournament now exists: the list shows it once.
  await mainMenu(page).getByRole('link', { name: 'Tournaments' }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
})
