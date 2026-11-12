import { expect, test, type Locator, type Page } from '@playwright/test'
import type { ExpectedDivision, ExpectedFinals, ExpectedList } from '../data/expectedResults'
import type { SquadData } from '../data/sessions'
import { openTournamentPage } from './navigate'

/** Open a squad or sweeper from its list by its date text. Returns its address, without a tab. */
export async function openSession(
  page: Page,
  session: SquadData,
  kind: 'squad' | 'sweeper' = 'squad',
): Promise<string> {
  const folder = kind === 'squad' ? 'squads' : 'sweepers'
  await openTournamentPage(page, kind === 'squad' ? 'Squads' : 'Sweepers')
  await page.getByRole('link', { name: session.label, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Open')
  const match = new RegExp(`^(/tournaments/[^/]+/${folder}/[^/]+)`).exec(
    new URL(page.url()).pathname,
  )
  if (!match?.[1]) throw new Error(`Not on a ${kind} page: ${page.url()}`)
  return match[1]
}

export const openSquad = (page: Page, squad: SquadData) => openSession(page, squad)

/**
 * On a squad's Lane assignments tab, put every unassigned bowler on a pair, one after another round
 * the pairs, so no pair passes its maximum (the dialog would refuse it) and no one is left over.
 */
export async function assignAllLanes(page: Page, squad: SquadData, entered: number) {
  await page.getByRole('link', { name: 'Lane assignments' }).click()
  const unassigned = page.getByRole('region', { name: 'Unassigned bowlers' })
  await expect(unassigned.getByRole('listitem')).toHaveCount(entered)
  const pairs = squad.lanes / 2
  for (let placed = 0; placed < entered; placed++) {
    await unassigned
      .getByRole('button', { name: /^Assign to lanes:/ })
      .first()
      .click()
    const first = squad.startingLane + 2 * (placed % pairs)
    await page
      .getByRole('dialog', { name: /^Assign .* to lanes$/ })
      .getByRole('button', { name: new RegExp(String.raw`^Lanes ${first}-${first + 1}(?!\d)`) })
      .click()
    await expect(unassigned.getByRole('listitem')).toHaveCount(entered - placed - 1)
  }
}

/**
 * Type every score of every game through the pair sheets, as the keeper does: the game board lists
 * the pairs of a game, each sheet has one box per bowler, and Enter saves a box and moves on.
 * `scoreOf` gives the score for a bowler's name and a game. Waits for each sheet to say Saved.
 */
export async function enterAllScores(
  page: Page,
  squadPath: string,
  games: number,
  scoreOf: (name: string, game: number) => number | null,
  /** How this squad differs from "everyone bowls every game": wrong numbers, walk-offs. */
  quirks: {
    typo?: (name: string, game: number) => number | undefined
    walksOff?: (name: string, game: number) => boolean
    /** Called after each pair sheet is done: game number and the pair's place in the game (from 0). */
    afterPair?: (game: number, pair: number) => Promise<void>
  } = {},
) {
  for (let game = 1; game <= games; game++) {
    await page.goto(`${squadPath}/scores/entry/${game}`)
    const tiles = page.getByRole('list', { name: `Pairs for game ${game}` })
    await expect(tiles).toBeVisible()
    const hrefs = await tiles
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    for (const [pair, href] of hrefs.entries()) {
      await page.goto(href)
      const sheet = page.getByRole('region', { name: new RegExp(`^Game ${game} · Lanes`) })
      await expect(sheet).toBeVisible()
      const boxes = await sheet.getByRole('textbox').all()
      let typed = 0
      // A keeper who types a wrong number, saves it, and fixes it: reload so the fix is a real edit.
      for (const box of await sheet.getByRole('textbox').all()) {
        const label = (await box.getAttribute('aria-label')) ?? ''
        const name = /^Lane \w+, (.+), game \d+$/.exec(label)?.[1] ?? ''
        const wrong = quirks.typo?.(name, game)
        const right = scoreOf(name, game)
        if (wrong === undefined || right === null) continue
        await saveBox(box, String(wrong))
        await page.reload()
        await expect(sheet).toBeVisible()
        await saveBox(box, String(right))
        typed++
      }
      for (const box of boxes) {
        const label = (await box.getAttribute('aria-label')) ?? ''
        const name = /^Lane \w+, (.+), game \d+$/.exec(label)?.[1]
        if (!name) throw new Error(`Unexpected score box: ${label}`)
        if ((await box.inputValue()) !== '') continue
        const score = scoreOf(name, game)
        if (score === null) {
          // A bowler who walks off is flagged at the game they stop; the box stays empty.
          if (quirks.walksOff?.(name, game)) {
            await sheet
              .getByRole('button', { name: new RegExp(`^Did not finish ?, ${escapeRegex(name)}$`) })
              .click()
            await expect(sheet.getByText('Did not finish', { exact: true })).toBeVisible()
          }
          continue
        }
        await saveBox(box, String(score))
        typed++
      }
      await expect(sheet.getByText('✓ Saved')).toHaveCount(typed)
      await quirks.afterPair?.(game, pair)
    }
  }
}

/** On a session page: complete it after reading the dialog. */
export async function completeSession(
  page: Page,
  kind: 'squad' | 'sweeper',
  entered: number,
  /** Bowlers with no scores (they get zeros) and with some games (they stay), and the games. */
  gaps?: { noScore: number; partial: number; games: number },
) {
  await page.getByRole('button', { name: `Complete ${kind}` }).click()
  const dialog = page.getByRole('dialog', { name: `Complete this ${kind}?` })
  await expect(dialog).toContainText(`${entered} bowlers are entered.`)
  // Every bowler has all their scores, so completing writes no zeros (D-190).
  if (kind === 'squad' && !gaps)
    await expect(dialog).toContainText('All have scores, so no zeros are saved.')
  if (gaps) {
    await expect(dialog).toContainText(
      `${gaps.noScore} has no scores and will get 0 for each of ${gaps.games} games.`,
    )
    await expect(dialog).toContainText(
      `${gaps.partial} has fewer than ${gaps.games} games and stays as entered.`,
    )
  }
  await dialog.getByRole('button', { name: `Complete ${kind}` }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Complete')
  await expect(page.getByRole('button', { name: `Complete ${kind}` })).toHaveCount(0)
}

/**
 * Type a score into a box and press Enter, then wait for that bowler's row to say Saved. An earlier
 * run lost an entry once and the cause was never found (three later runs lost none), so a box whose
 * row does not say Saved is typed again, and each retry is added to the report as a "lost box entry"
 * annotation. A passing run with that annotation means the pair sheet dropped an entry.
 */
async function saveBox(box: Locator, score: string) {
  const row = box.locator('xpath=ancestor::li[1]')
  for (let attempt = 1; ; attempt++) {
    await box.fill(score)
    await box.press('Enter')
    try {
      await expect(row.getByText('✓ Saved')).toBeVisible({ timeout: 3_000 })
      return
    } catch (error) {
      // A retry means the box lost its entry. Say so in the report instead of hiding it.
      const label = (await box.getAttribute('aria-label').catch(() => null)) ?? '?'
      const value = await box.inputValue().catch(() => '?')
      const rowText = (await row.innerText().catch(() => '?')).replaceAll('\n', ' | ')
      test.info().annotations.push({
        type: 'lost box entry',
        description: `attempt ${attempt}, typed ${score}, ${label}, box now "${value}", row: ${rowText}`,
      })
      if (attempt === 3) throw error
    }
  }
}

/**
 * On a squad's Results tab, pick a division and check its rows, lines, and tie notes against the
 * hand-written expectation. Rows come as the page lists them: a line row gives its label, a bowler
 * row gives the name. A list of names means the row holds any one of them (a full tie splits across a line).
 */
export async function checkDivisionResults(page: Page, squadPath: string, want: ExpectedDivision) {
  await page.goto(`${squadPath}/results`)
  await chooseDivision(page, want.division)
  const table = page.getByRole('table', { name: `Results for the ${want.division} division` })
  await expect(table).toBeVisible()
  await expectTable(table, table.locator('tbody tr'), want)
}

/** A sweeper's Results tab against the hand-written list. */
export async function checkSweeperResults(page: Page, sweeperPath: string, want: ExpectedList) {
  await page.goto(`${sweeperPath}/results`)
  const table = page.getByRole('table', { name: 'Sweeper results' })
  await expect(table).toBeVisible()
  await expectTable(table, table.locator('tbody tr'), want)
}

/** The super sweeper page against the hand-written list (one `tbody` for each bowler or line). */
export async function checkSuperSweeper(page: Page, sweeperPath: string, want: ExpectedList) {
  await page.goto(sweeperPath.replace(/\/sweepers\/.*$/, '/super-sweeper'))
  const table = page.getByRole('table', { name: 'Super sweeper results' })
  await expect(table).toBeVisible()
  await expectTable(table, table.locator('tbody'), want)
}

/**
 * At-large or seeding for one division: the summary line, the rows and tie notes, and which rows
 * say "Cashed on a squad". `tournamentPath` is `/tournaments/{id}`.
 */
export async function checkFinals(
  page: Page,
  tournamentPath: string,
  kind: 'at-large' | 'seeding',
  want: ExpectedFinals,
) {
  await page.goto(`${tournamentPath}/${kind}`)
  await chooseDivision(page, want.division)
  await expect(page.getByText(want.summary)).toBeVisible()
  if (want.empty) {
    await expect(page.getByText(want.empty)).toBeVisible()
    return
  }
  const caption =
    kind === 'at-large'
      ? `At-large results for the ${want.division} division`
      : `Finals seeding for the ${want.division} division`
  const table = page.getByRole('table', { name: caption })
  await expect(table).toBeVisible()
  await expectTable(table, table.locator('tbody tr'), {
    order: want.order ?? [],
    notes: want.notes ?? {},
  })
  for (const [who, date] of Object.entries(want.squadDates ?? {})) {
    await expect(table.getByRole('row').filter({ hasText: who })).toContainText(date)
  }
  const marked = table.getByRole('row').filter({ hasText: 'Cashed on a squad' })
  await expect(marked).toHaveCount(want.cashers?.length ?? 0)
  for (const casher of want.cashers ?? []) {
    await expect(table.getByRole('row').filter({ hasText: casher })).toContainText(
      'Cashed on a squad',
    )
  }
}

/** Both finals pages say "Unofficial results" or do not, as the squads stand. */
export async function checkFinalsOfficial(page: Page, tournamentPath: string, official: boolean) {
  for (const kind of ['at-large', 'seeding']) {
    await page.goto(`${tournamentPath}/${kind}`)
    await expect(page.getByRole('combobox', { name: 'Division' })).toBeVisible()
    await expect(page.getByText(/Unofficial results/)).toHaveCount(official ? 0 : 1)
  }
}

/** Read each row's name or line label, then compare with the expected order and tie notes. */
async function expectTable(table: Locator, rows: Locator, want: ExpectedList) {
  const actual = await rows.evaluateAll((elements) =>
    elements.map((element) => {
      const row = element.tagName === 'TR' ? element : element.querySelector('tr')
      const who = row?.querySelector('th[scope="row"], th[scope="rowgroup"]')
      // The name is the first text of the cell; tags and tie notes follow in spans.
      return who ? (who.firstChild?.textContent ?? '').trim() : (row?.textContent ?? '').trim()
    }),
  )
  let at = 0
  for (const item of want.order) {
    if (Array.isArray(item)) {
      expect(item).toContain(actual[at])
    } else {
      expect(actual[at]).toBe(item)
    }
    at++
  }
  for (const [note, count] of Object.entries(want.notes)) {
    await expect(table.getByText(note, { exact: true })).toHaveCount(count)
  }
}

/** The bowler's row on a squad's results shows the earlier-advancer tag (RES-06). */
export async function checkEarlierAdvancer(
  page: Page,
  squadPath: string,
  division: string,
  name: string,
) {
  await page.goto(`${squadPath}/results`)
  await chooseDivision(page, division)
  const table = page.getByRole('table', { name: `Results for the ${division} division` })
  await expect(table.getByRole('row').filter({ hasText: name })).toContainText('Advanced earlier')
}

/** Pick a division by its name in the chooser, whose options read "Name (N entries)". */
async function chooseDivision(page: Page, division: string) {
  const chooser = page.getByRole('combobox', { name: 'Division' })
  const option = chooser.getByRole('option', { name: new RegExp(String.raw`^${division} \(`) })
  await chooser.selectOption(await option.getAttribute('value'))
}

/**
 * On a complete squad's results: a division lists a bowler under "No show" or "Did not finish"
 * (RES-30), and does not place them.
 */
export async function checkGapSection(
  page: Page,
  squadPath: string,
  division: string,
  section: 'No show' | 'Did not finish',
  name: string,
) {
  await page.goto(`${squadPath}/results`)
  await chooseDivision(page, division)
  await expect(page.getByRole('heading', { level: 3, name: section })).toBeVisible()
  const list =
    section === 'No show'
      ? page.getByRole('listitem').filter({ hasText: name })
      : page
          .getByRole('table', { name: `${division} division, did not finish` })
          .getByRole('row')
          .filter({ hasText: name })
  await expect(list).toHaveCount(1)
  // The bowler has no place in the main table.
  const placed = page.getByRole('table', { name: `Results for the ${division} division` })
  await expect(placed.getByRole('row').filter({ hasText: name })).toHaveCount(0)
}

export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

/**
 * While a squad is part way through a game: the default ranking counts only the games every bowler
 * has (RES-40), says the next game is not complete yet (RES-46), and the Live choice keeps its
 * place in the address (RES-45). `want` is the hand-written order through `throughGame`.
 */
export async function checkRankingModes(
  page: Page,
  squadPath: string,
  want: ExpectedDivision,
  throughGame: number,
) {
  await page.goto(`${squadPath}/results`)
  await chooseDivision(page, want.division)
  await expect(page.getByRole('radio', { name: `Through game ${throughGame}` })).toBeChecked()
  await expect(
    page.getByText(new RegExp(`Game ${throughGame + 1} is not complete yet`)),
  ).toBeVisible()
  const table = page.getByRole('table', { name: `Results for the ${want.division} division` })
  await expect(table).toBeVisible()
  await expectTable(table, table.locator('tbody tr'), want)

  await page.getByRole('radio', { name: 'Live' }).click()
  await expect(page).toHaveURL(/mode=live/)
  await expect(page.getByRole('radio', { name: 'Live' })).toBeChecked()
  await expect(table).toBeVisible()
}

/** The public TV page lists the tournament's divisions in sections while a squad is open (RES-47). */
export async function checkTvPage(page: Page, tournamentPath: string, tournamentName: string) {
  await page.goto(`${tournamentPath}/liveResults`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(tournamentName)
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
}
