import { expect, type Page } from '@playwright/test'
import { fullName, type Bowler } from '../data/bowlers'
import { noShowTournament } from '../data/noShow'
import { apiUrl } from './stack'
import { VendorApi, type VendorTournament } from './vendorApi'
import { idByName, vendorRegistration } from './vendorPayload'

export interface Entry {
  bowler: Bowler
  division: string
  squadIds: string[]
  sweeperIds?: string[]
}

/** Register through the site: the registration id by bowler name. */
export async function registerEntries(
  main: VendorTournament,
  entries: Entry[],
): Promise<Map<string, string>> {
  const site = await VendorApi.open()
  const ids = new Map<string, string>()
  try {
    for (const { bowler, division, squadIds, sweeperIds = [] } of entries) {
      const id = await site.register(
        vendorRegistration(bowler, main, {
          divisionId: idByName(main.divisions, division),
          squadIds,
          sweeperIds,
          superSweeper: false,
          amount: Number(noShowTournament.entryFee) * squadIds.length,
          codePrefix: `ch_makeup_${squadIds.length}`,
        }),
      )
      ids.set(fullName(bowler), id)
    }
  } finally {
    await site.close()
  }
  return ids
}

export const idOfName = (ids: Map<string, string>, name: string) => {
  const id = ids.get(name)
  if (!id) throw new Error(`No registration for ${name}`)
  return id
}

/** Save the same score in all three games through the signed-in API: keying is covered above. */
export async function saveScores(
  page: Page,
  squadUrl: string,
  scores: { registrationId: string; score: number }[],
) {
  for (const { registrationId, score } of scores) {
    for (const game of [1, 2, 3]) {
      const response = await page.request.put(
        `${apiUrl}${squadUrl}/scores/${registrationId}/${game}`,
        {
          data: { score },
        },
      )
      expect(response.ok(), await response.text()).toBe(true)
    }
  }
}

interface Row {
  name: string
  group: string
  byRuling?: boolean
  advancedEarlier: boolean
  payout: string | null
}

/** The rows of one division of a squad's public results. */
export async function resultRows(page: Page, squadUrl: string, division: string): Promise<Row[]> {
  const response = await page.request.get(`${apiUrl}${squadUrl}/results`)
  expect(response.ok(), await response.text()).toBe(true)
  const { divisions } = (await response.json()) as { divisions: { name: string; rows: Row[] }[] }
  const found = divisions.find((item) => item.name === division)
  if (!found) throw new Error(`No ${division} results`)
  return found.rows
}

/** The names of one group, in place order. */
export async function namesIn(page: Page, squadUrl: string, division: string, group: string) {
  const rows = await resultRows(page, squadUrl, division)
  return rows.filter((row) => row.group === group).map((row) => row.name)
}

/** On the squad's Results tab: pick the division, then open the no-show's dialog. */
export async function openNoShowDialog(
  page: Page,
  resultsPath: string,
  division: string,
  name: string,
) {
  await page.goto(resultsPath)
  const chooser = page.getByRole('combobox', { name: 'Division' })
  await chooser.selectOption(
    await chooser
      .getByRole('option', { name: new RegExp(`^${division} \\(`) })
      .getAttribute('value'),
  )
  await page.getByRole('button', { name: `Move or refund ${name}` }).click()
  return page.getByRole('dialog', { name: `Move or refund ${name}` })
}
