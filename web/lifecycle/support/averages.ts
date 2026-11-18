import { expect, type Page } from '@playwright/test'
import { openTournamentPage } from './navigate'

/**
 * Open the Averages page and verify every handicap bowler on it, one click each (AVG-02, AVG-03,
 * D-295). A session with an unchecked handicap bowler who has scores asks for a confirm before it
 * completes (AVG-18), so each session test checks the averages first, as a director does. Every
 * bowler here gave an average, so Verify keeps handicap as it was and the results stay as worked.
 */
export async function verifyAllAverages(page: Page) {
  await openTournamentPage(page, 'Averages')
  await expect(page.getByRole('heading', { name: 'Averages', level: 1 })).toBeVisible()
  const verify = page.getByRole('button', { name: /^Verify / })
  const done = page.getByText('Every handicap bowler has a checked average.')
  // Wait for the first answer: either a button to press, or the page that says there is none.
  await expect(verify.first().or(done)).toBeVisible()
  for (let left = await verify.count(); left > 0; left = await verify.count()) {
    await verify.first().click()
    // The list asks again after each save: wait for the row to leave before the next click.
    await expect(verify).toHaveCount(left - 1)
  }
  await expect(done).toBeVisible()
}
