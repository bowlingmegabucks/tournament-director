import { expect, test } from '@playwright/test'
import { admin, director, scoreKeeper } from './data/people'
import { earlier, editedBowlingCenter, tournament } from './data/tournament'
import { divisions, scratch } from './data/divisions'
import {
  outsideDate,
  spareSquad,
  spareSweeper,
  squadA,
  squadAEdited,
  squadB,
  squadC,
  squadD,
  squads,
  sweeperOne,
  sweeperTwo,
  sweeperTwoCreatedFee,
  sweeperTwoEdited,
  sweepers,
} from './data/sessions'
import { createFirstAdmin } from './support/createAdmin'
import {
  addDeskRegistration,
  addDivision,
  addSquad,
  addSweeper,
  addTournament,
  divisionRow,
  sessionCard,
} from './support/forms'
import {
  assignAllLanes,
  checkDivisionResults,
  checkEarlierAdvancer,
  checkFinals,
  checkGapSection,
  checkFinalsOfficial,
  checkSuperSweeper,
  checkSweeperResults,
  completeSession,
  enterAllScores,
  openSession,
  openSquad,
} from './support/session'
import {
  atLargeResults,
  earlierAdvancer,
  seedingResults,
  expectedResults,
  superSweeperResults,
  sweeperOneResults,
  sweeperTwoResults,
} from './data/expectedResults'
import { enteredScore, scoreOf, typoFor, walksOff } from './data/scores'
import { VendorApi } from './support/vendorApi'
import { idByDate, idByName, vendorRegistration } from './support/vendorPayload'
import { bowlerAt, deskBowlers, fullName, returning, siteBowlers } from './data/bowlers'
import {
  afterDeskExpected,
  deskBatchOf,
  deskBatches,
  deskSquadsFor,
  deskSuperSweeperFor,
  divisionFor,
  siteExpected,
  totalToCollect,
  squadFee,
  squadsFor,
  superSweeperFor,
  sweepersFor,
} from './data/registrationPlan'
import { openTournamentPage } from './support/navigate'
import { inviteLinkIn, waitForMail } from './support/mail'
import { mainMenu, signIn } from './support/signIn'

// docs/plans/lifecycle-e2e.md. Stages run in order (rule 8): a failed stage skips the rest.
test.describe.configure({ mode: 'serial' })

/** The registration id the site got for each bowler number, for the stages that follow. */
const siteRegistrationIds = new Map<number, string>()

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

test('stage 0: the earlier tournament, and its 50 bowlers register through the site', async ({
  page,
}) => {
  await signIn(page, director)
  await mainMenu(page).getByRole('link', { name: 'Tournaments' }).click()
  await addTournament(page, earlier)
  await page
    .getByRole('navigation', { name: earlier.name })
    .getByRole('link', { name: 'Divisions' })
    .click()
  await addDivision(page, { name: earlier.division.name, fields: {} })
  await expect(page.getByText('Division created')).toBeVisible()
  await page
    .getByRole('navigation', { name: earlier.name })
    .getByRole('link', { name: 'Squads' })
    .click()
  await addSquad(page, { ...earlier.squad, date: earlier.squad.date, label: '' })
  await expect(page.getByText('Squad created')).toBeVisible()

  const site = await VendorApi.open()
  try {
    const earlierTournament = await site.tournament(earlier.name)
    const divisionId = idByName(earlierTournament.divisions, earlier.division.name)
    const squadId = idByDate(earlierTournament.squads, earlier.squad.date)
    for (const bowler of returning) {
      await site.register(
        vendorRegistration(bowler, earlierTournament, {
          divisionId,
          squadIds: [squadId],
          sweeperIds: [],
          superSweeper: false,
          amount: Number(earlier.entryFee),
          codePrefix: 'ch_earlier',
        }),
      )
    }
  } finally {
    await site.close()
  }

  await page
    .getByRole('navigation', { name: earlier.name })
    .getByRole('link', { name: 'Registrations' })
    .click()
  await expect(page.getByText('Bowlers registered').locator('+ dd')).toHaveText('50')
})

test('stage 1: the director creates the tournament, edits a free field, and checks the overview', async ({
  page,
}) => {
  await signIn(page, director)
  await mainMenu(page).getByRole('link', { name: 'Tournaments' }).click()
  await addTournament(page, tournament)
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

  // The list shows the tournament once, beside the earlier one.
  await mainMenu(page).getByRole('link', { name: 'Tournaments' }).click()
  await expect(page.getByRole('article').filter({ hasText: tournament.name })).toHaveCount(1)
  await expect(page.getByRole('article')).toHaveCount(2)
})

test('stage 2: the director makes three divisions and the list numbers them', async ({ page }) => {
  await signIn(page, director)
  await openTournamentPage(page, 'Divisions')
  await expect(page.getByText('No divisions yet.')).toBeVisible()

  for (const division of divisions) {
    await addDivision(page, division, division.gender === 'Any' ? undefined : division.gender)
    await expect(page.getByText('Division created')).toBeVisible()
    const row = divisionRow(page, division.name)
    await expect(row.getByRole('cell').nth(0)).toHaveText(String(division.number))
    await expect(row).toContainText(division.gender)
    await expect(row).toContainText(division.ages)
    await expect(row).toContainText(division.averages)
    await expect(row).toContainText(division.handicap)
  }
  await expect(page.getByRole('rowheader')).toHaveText(divisions.map((division) => division.name))

  // Scripted failure: a name already used is a 409 and the list does not change.
  await addDivision(page, scratch)
  await expect(page.getByRole('heading', { name: 'New division', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Name (required)', { exact: true })).toHaveAccessibleDescription(
    /already/i,
  )
  await openTournamentPage(page, 'Divisions')
  await expect(page.getByRole('rowheader')).toHaveCount(divisions.length)
})

test('stage 3: four squads and two sweepers, an edit of each, and a spare of each deleted', async ({
  page,
}) => {
  await signIn(page, director)
  await openTournamentPage(page, 'Squads')

  for (const squad of squads) {
    await addSquad(page, squad)
    await expect(page.getByText('Squad created')).toBeVisible()
  }

  // Scripted failure: a squad dated after the tournament is a 409 with the message.
  await addSquad(page, { ...squadA, date: outsideDate })
  await expect(page.getByRole('heading', { name: 'New squad', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Date and time (required)')).toHaveAccessibleDescription(
    /tournament/i,
  )
  await openTournamentPage(page, 'Squads')

  // Edit one squad: A gains two lanes.
  await page.getByRole('link', { name: `Edit squad ${squadA.label}` }).click()
  await page.getByLabel('Number of lanes (required)').fill(String(squadAEdited.lanes))
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Squad saved')).toBeVisible()

  // The cards: the tournament's fee where the squad has none, the squad's own where it has.
  await expect(sessionCard(page, squadA.label)).toContainText(squadAEdited.rangeText)
  await expect(sessionCard(page, squadA.label)).toContainText('Up to 4')
  await expect(sessionCard(page, squadA.label)).toContainText('$60.00')
  await expect(sessionCard(page, squadA.label)).not.toContainText('(override)')
  await expect(sessionCard(page, squadB.label)).toContainText('48 lanes')
  await expect(sessionCard(page, squadB.label)).toContainText('Up to 5')
  await expect(sessionCard(page, squadB.label)).toContainText('$75.00 (override)')
  await expect(sessionCard(page, squadC.label)).toContainText('11 to 50 (40 lanes)')
  await expect(sessionCard(page, squadC.label)).toContainText('1 in 5.0 (override)')
  await expect(sessionCard(page, squadD.label)).toContainText('1 to 40 (40 lanes)')

  // A spare squad is made and deleted (SQD-14).
  await addSquad(page, spareSquad)
  await expect(sessionCard(page, spareSquad.label)).toHaveCount(1)
  await page.getByRole('button', { name: `Delete squad ${spareSquad.label}` }).click()
  await page
    .getByRole('dialog', { name: 'Delete this squad?' })
    .getByRole('button', { name: 'Delete squad' })
    .click()
  await expect(page.getByText('Squad deleted')).toBeVisible()
  await expect(sessionCard(page, spareSquad.label)).toHaveCount(0)
  for (const squad of squads) await expect(sessionCard(page, squad.label)).toHaveCount(1)

  // Sweepers.
  await openTournamentPage(page, 'Sweepers')
  for (const sweeper of sweepers) {
    await addSweeper(
      page,
      sweeper === sweeperTwo ? { ...sweeper, entryFee: sweeperTwoCreatedFee } : sweeper,
    )
    await expect(page.getByText('Sweeper created')).toBeVisible()
  }
  await expect(sessionCard(page, sweeperOne.label)).toContainText('$35.00')
  await expect(sessionCard(page, sweeperOne.label)).toContainText('Women or Seniors: +15')
  await expect(sessionCard(page, sweeperTwo.label)).toContainText('$25.00')
  await expect(sessionCard(page, sweeperTwo.label)).not.toContainText('+')

  // Edit one sweeper: two's fee goes from $25 to $30.
  await page.getByRole('link', { name: `Edit sweeper ${sweeperTwo.label}` }).click()
  await page.getByLabel('Entry fee (required)').fill(sweeperTwoEdited.entryFee)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Sweeper saved')).toBeVisible()
  await expect(sessionCard(page, sweeperTwo.label)).toContainText(sweeperTwoEdited.feeText)

  // A spare sweeper is made and deleted.
  await addSweeper(page, spareSweeper)
  await expect(sessionCard(page, spareSweeper.label)).toHaveCount(1)
  await page.getByRole('button', { name: `Delete sweeper ${spareSweeper.label}` }).click()
  await page
    .getByRole('dialog', { name: 'Delete this sweeper?' })
    .getByRole('button', { name: 'Delete sweeper' })
    .click()
  await expect(page.getByText('Sweeper deleted')).toBeVisible()
  await expect(sessionCard(page, spareSweeper.label)).toHaveCount(0)
  for (const sweeper of sweepers) await expect(sessionCard(page, sweeper.label)).toHaveCount(1)
})

test('stage 4: the registration site registers 90 bowlers, 50 of them returning', async ({
  page,
}) => {
  const site = await VendorApi.open()
  const main = await site.tournament(tournament.name)
  try {
    for (const bowler of siteBowlers) {
      const squads = squadsFor(bowler)
      const sweepers = sweepersFor(bowler)
      const amount =
        squads.reduce((sum, squad) => sum + squadFee(squad, main.entryFee), 0) +
        sweepers.reduce((sum, sweeper) => sum + Number(sweeper.entryFee), 0)
      const registrationId = await site.register(
        vendorRegistration(bowler, main, {
          divisionId: idByName(main.divisions, divisionFor(bowler)),
          squadIds: squads.map((squad) => idByDate(main.squads, squad.date)),
          sweeperIds: sweepers.map((sweeper) => idByDate(main.sweepers, sweeper.date)),
          superSweeper: superSweeperFor(bowler),
          amount,
          codePrefix: 'ch_site',
        }),
      )
      siteRegistrationIds.set(bowler.index, registrationId)
    }
  } finally {
    await site.close()
  }
  // The Registrations page counts what the site sent.
  await signIn(page, director)
  await openTournamentPage(page, 'Registrations')
  await expect(page.getByText('Bowlers registered').locator('+ dd')).toHaveText(
    String(siteExpected.registrations),
  )
  await expect(page.getByText('Super sweeper', { exact: true }).locator('+ dd')).toHaveText(
    String(siteExpected.superSweepers),
  )
  const bySquad = page.getByRole('region', { name: 'By squad' })
  for (const squad of squads) {
    await expect(bySquad.getByRole('listitem').filter({ hasText: squad.label })).toContainText(
      String(siteExpected.squadEntries),
    )
  }
  const bySweeper = page.getByRole('region', { name: 'By sweeper' })
  await expect(bySweeper.getByRole('listitem').filter({ hasText: sweeperOne.label })).toContainText(
    String(siteExpected.sweeperOneEntries),
  )
  await expect(bySweeper.getByRole('listitem').filter({ hasText: sweeperTwo.label })).toContainText(
    String(siteExpected.sweeperTwoEntries),
  )
})

test('stage 4: a division that does not fit, and a repeated payment code, change nothing (D-107, D-109)', async () => {
  const site = await VendorApi.open()
  try {
    const main = await site.tournament(tournament.name)
    // The division takes women, or anyone 50 and up (REG-04e). A man under 50 fits neither.
    const man = deskBowlers.find(
      (bowler) => bowler.gender === 'M' && bowler.age < 50 && bowler.average <= 180,
    )
    if (!man) throw new Error('Expected a desk bowler who is a man under 50')
    const refused = await site.registerRaw(
      vendorRegistration(man, main, {
        divisionId: idByName(main.divisions, 'Women or Seniors'),
        squadIds: [idByDate(main.squads, squadA.date)],
        sweeperIds: [],
        superSweeper: false,
        amount: 60,
        codePrefix: 'ch_refused',
      }),
    )
    expect(refused.status, refused.body).toBe(400)
    expect(refused.body).toContain('Bowler too young for selected division')

    // Bowler 5 sends the same payment code again: a retry with the same id, no second entry.
    const bowler = siteBowlers[5]
    const stored = siteRegistrationIds.get(5)
    if (!bowler || !stored) throw new Error('Bowler 5 should be registered')
    const squads = squadsFor(bowler)
    const sweepers = sweepersFor(bowler)
    const retry = await site.registerRaw(
      vendorRegistration(bowler, main, {
        divisionId: idByName(main.divisions, divisionFor(bowler)),
        squadIds: squads.map((squad) => idByDate(main.squads, squad.date)),
        sweeperIds: sweepers.map((sweeper) => idByDate(main.sweepers, sweeper.date)),
        superSweeper: superSweeperFor(bowler),
        amount: totalToCollect(squads, sweepers, main.entryFee),
        codePrefix: 'ch_site',
      }),
    )
    expect(retry.status, retry.body).toBe(201)
    expect((JSON.parse(retry.body) as { registrationId: string }).registrationId).toBe(stored)
  } finally {
    await site.close()
  }
})

function registrationCountsTest() {
  test('stage 4: after the desk batches, the counts match the hand-worked table', async ({
    page,
  }) => {
    await signIn(page, director)
    await openTournamentPage(page, 'Registrations')
    await expect(page.getByText('Bowlers registered').locator('+ dd')).toHaveText(
      String(afterDeskExpected.registrations),
    )
    await expect(page.getByText('Super sweeper', { exact: true }).locator('+ dd')).toHaveText(
      String(afterDeskExpected.superSweepers),
    )
    const bySquad = page.getByRole('region', { name: 'By squad' })
    const expected = afterDeskExpected.squadEntries
    for (const [squad, count] of [
      [squadA, expected.A],
      [squadB, expected.B],
      [squadC, expected.C],
      [squadD, expected.D],
    ] as const) {
      await expect(bySquad.getByRole('listitem').filter({ hasText: squad.label })).toContainText(
        String(count),
      )
    }
    const bySweeper = page.getByRole('region', { name: 'By sweeper' })
    await expect(
      bySweeper.getByRole('listitem').filter({ hasText: sweeperOne.label }),
    ).toContainText(String(afterDeskExpected.sweeperOneEntries))
    await expect(
      bySweeper.getByRole('listitem').filter({ hasText: sweeperTwo.label }),
    ).toContainText(String(afterDeskExpected.sweeperTwoEntries))
  })
}

// Walk-ins arrive before the squad they want, so the desk registers in four batches, and each
// squad is bowled and completed before the next batch arrives.
for (const batch of deskBatches) {
  const squad = squads[batch]
  test(`stage 4: the desk registers batch ${batch + 1} of 15 new bowlers before squad ${'ABCD'[batch]}`, async ({
    page,
  }) => {
    const site = await VendorApi.open()
    const main = await site.tournament(tournament.name)
    await site.close()
    await signIn(page, director)
    await openTournamentPage(page, 'Registrations')
    const before = 90 + batch * 15
    // The refused request and the retry above left the site's 90 as they were.
    await expect(page.getByText('Bowlers registered').locator('+ dd')).toHaveText(String(before))

    for (const bowler of deskBatchOf(deskBowlers, batch)) {
      const entered = deskSquadsFor(bowler)
      const sweepers = sweepersFor(bowler)
      // The batch's own squad is always among the bowler's squads.
      expect(entered).toContain(squad)
      await addDeskRegistration(page, bowler, {
        division: divisionFor(bowler),
        squadLabels: entered.map((entry) => entry.label),
        sweeperLabels: sweepers.map((sweeper) => sweeper.label),
        superSweeper: deskSuperSweeperFor(bowler),
        total: totalToCollect(entered, sweepers, main.entryFee),
      })
    }

    await expect(page.getByText('Bowlers registered').locator('+ dd')).toHaveText(
      String(before + 15),
    )
  })

  // After the last batch, every squad's entries are final: check them against the hand-worked table.
  if (batch === 3) registrationCountsTest()

  // Then the squad is bowled: lanes, scores, and complete, before the next batch arrives.
  test(`stage 5 to 7: squad ${'ABCD'[batch]} gets lanes and scores, then completes`, async ({
    page,
  }) => {
    const entered = Object.values(afterDeskExpected.squadEntries)[batch] ?? 0
    await signIn(page, director)
    const path = await openSquad(page, squad)
    await assignAllLanes(page, squad, entered)
    const letter = 'ABCD'[batch] ?? ''
    await enterAllScores(
      page,
      path,
      Number(tournament.games),
      (name, game) => enteredScore(name, game, letter),
      {
        typo: (name, game) => typoFor(name, game, letter),
        walksOff: (name, game) => walksOff(name, game, letter),
      },
    )
    // The public Scores tab shows what the keeper typed: one site bowler's six games.
    const bowler = siteBowlers.find((candidate) => squadsFor(candidate).includes(squad))
    if (!bowler) throw new Error('No site bowler in this squad')
    await page.goto(`${path}/scores`)
    const row = page.getByRole('row').filter({ hasText: fullName(bowler) })
    for (let game = 1; game <= Number(tournament.games); game++) {
      await expect(row).toContainText(String(scoreOf(bowler, game, letter)))
    }
    await page.goto(path)
    // Squad D has a no-show (zeros saved) and a walk-off (stays as entered).
    await completeSession(
      page,
      'squad',
      entered,
      letter === 'D' ? { noScore: 1, partial: 1, games: Number(tournament.games) } : undefined,
    )
    if (letter === 'D') {
      await checkGapSection(page, path, 'Handicap', 'No show', fullName(bowlerAt(149)))
      await checkGapSection(page, path, 'Scratch', 'Did not finish', fullName(bowlerAt(147)))
    }
    // The squad's results against the designed scores: places, lines, and tie notes.
    for (const want of expectedResults.filter((candidate) => candidate.squad === letter)) {
      await checkDivisionResults(page, path, want)
    }
    if (earlierAdvancer.squad === letter) {
      await checkEarlierAdvancer(page, path, earlierAdvancer.division, earlierAdvancer.name)
    }
    // At-large and seeding say "Unofficial results" until the last squad completes (D-88).
    const tournamentPath = path.replace(/\/squads\/.*$/, '')
    await checkFinalsOfficial(page, tournamentPath, batch === 3)
    if (batch === 3) {
      for (const want of atLargeResults) await checkFinals(page, tournamentPath, 'at-large', want)
      for (const want of seedingResults) await checkFinals(page, tournamentPath, 'seeding', want)
    }
  })
}

// The sweepers follow the squads, in time order: one on Thursday evening, two on Friday morning.
// Every entry is in by now (the site's and the desk's), so each gets lanes, three games, and complete.
for (const [number, sweeper, entered] of [
  [1, sweeperOne, afterDeskExpected.sweeperOneEntries],
  [2, sweeperTwo, afterDeskExpected.sweeperTwoEntries],
] as const) {
  test(`stage 5 to 7: sweeper ${number === 1 ? 'one' : 'two'} gets lanes and scores, then completes`, async ({
    page,
  }) => {
    const key = `S${number}`
    await signIn(page, director)
    const path = await openSession(page, sweeper, 'sweeper')
    await assignAllLanes(page, sweeper, entered)
    await enterAllScores(page, path, Number(sweeper.games), (name, game) =>
      enteredScore(name, game, key),
    )
    // The public Scores tab shows what the keeper typed: one site bowler's three games.
    const bowler = siteBowlers.find((candidate) => sweepersFor(candidate).includes(sweeper))
    if (!bowler) throw new Error('No site bowler in this sweeper')
    await page.goto(`${path}/scores`)
    const row = page.getByRole('row').filter({ hasText: fullName(bowler) })
    for (let game = 1; game <= Number(sweeper.games); game++) {
      await expect(row).toContainText(String(scoreOf(bowler, game, key)))
    }
    await page.goto(path)
    await completeSession(page, 'sweeper', entered)
    await checkSweeperResults(page, path, number === 1 ? sweeperOneResults : sweeperTwoResults)
    // Both sweepers are complete after the second: the super sweeper is official.
    if (number === 2) {
      await checkSuperSweeper(page, path, superSweeperResults)
      // Bowler 90 never bowled sweeper one: the row says so and scores 0 there (D-90).
      await expect(page.getByText('Missed a sweeper', { exact: true })).toHaveCount(1)
      await expect(page.getByText(/^Missed the .* sweeper\. Scored 0 for 3 games\.$/)).toHaveCount(
        1,
      )
    }
  })
}
