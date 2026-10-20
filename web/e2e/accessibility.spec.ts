import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const wcagAA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// axe checks color contrast in a real browser, which jsdom unit tests cannot do.
for (const colorScheme of ['dark', 'light'] as const) {
  test(`home page has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    // Wait for data so axe scans the list and not the loading state.
    await expect(page.getByRole('listitem').first()).toBeVisible()

    const { violations } = await new AxeBuilder({ page }).withTags(wcagAA).analyze()

    expect(violations).toEqual([])
  })
}
