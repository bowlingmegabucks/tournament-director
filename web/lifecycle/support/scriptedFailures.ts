import { expect, type Page } from '@playwright/test'
import { squadA, squadB, squadD, sweeperOne } from '../data/sessions'
import { tournament } from '../data/tournament'
import { call, expectRefused } from './refusals'
import { VendorApi } from './vendorApi'
import { idByDate } from './vendorPayload'

/**
 * The scripted failures that need entries, saved lanes, scores, or a complete session
 * (docs/plans/lifecycle-e2e.md, "Scripted failures"). Each makes a call the UI hides or disables,
 * as the signed-in user, and checks the refusal and that nothing changed. `registrationIds` maps a
 * site bowler's number to their registration id.
 */
export async function ids() {
  const site = await VendorApi.open()
  try {
    const main = await site.tournament(tournament.name)
    return {
      main,
      base: `/v1/tournaments/${main.id}`,
      squadA: idByDate(main.squads, squadA.date),
      squadB: idByDate(main.squads, squadB.date),
      squadD: idByDate(main.squads, squadD.date),
      sweeperOne: idByDate(main.sweepers, sweeperOne.date),
    }
  } finally {
    await site.close()
  }
}

const registrationOf = (registrationIds: Map<number, string>, bowler: number) => {
  const found = registrationIds.get(bowler)
  if (!found) throw new Error(`No registration id for bowler ${bowler}`)
  return found
}

/** Sweepers are open, a squad has entries: the super sweeper guard, and a delete with entries. */
export async function refusalsWithEntries(page: Page, registrationIds: Map<number, string>) {
  const known = await ids()
  // D-203: a bowler in the super sweeper cannot drop a sweeper.
  const sixth = await call(
    page,
    'PATCH',
    `${known.base}/registrations/${registrationOf(registrationIds, 6)}`,
    { removeSweeperIds: [known.sweeperOne] },
  )
  expectRefused(sixth, 400, 'Remove the Super Sweeper first')
  // SQD-14, D-186: a squad with entries is not deleted, and stays.
  const remove = await call(page, 'DELETE', `${known.base}/squads/${known.squadD}`)
  expectRefused(remove, 409)
  expect(remove.body.errors).toBeDefined()
  const stays = await call(page, 'GET', `${known.base}/squads`)
  expect(JSON.stringify(stays.body)).toContain(known.squadD)
}

/** Squad D has saved lanes and no scores: a lane edit that no longer fits, a score above 300. */
export async function refusalsWithLanes(page: Page, registrationIds: Map<number, string>) {
  const known = await ids()
  // LAN: two lanes cannot hold the pairs already saved.
  const lanes = await call(page, 'PATCH', `${known.base}/squads/${known.squadD}`, {
    numberOfLanes: 2,
  })
  expectRefused(lanes, 409)
  expect(lanes.body.errors).toBeDefined()
  // SCR: a score above 300 is refused and nothing is saved.
  const high = await call(
    page,
    'PUT',
    `${known.base}/squads/${known.squadD}/scores/${registrationOf(registrationIds, 1)}/1`,
    { score: 301 },
  )
  expect(high.status, JSON.stringify(high.body)).toBe(400)
}

/** Squad D is complete: a repeat complete, a score, and a flag are all refused. */
export async function refusalsAfterComplete(page: Page, registrationIds: Map<number, string>) {
  const known = await ids()
  // D-192: a second complete is a 409 and saves no second set of zeros.
  const again = await call(page, 'POST', `${known.base}/squads/${known.squadD}/complete`)
  expectRefused(again, 409, 'This squad is already complete')
  // D-228, SCR-14: no score or flag changes in a complete squad.
  const bowler = registrationOf(registrationIds, 1)
  const score = await call(page, 'PUT', `${known.base}/squads/${known.squadD}/scores/${bowler}/1`, {
    score: 200,
  })
  expectRefused(score, 409, 'Scores cannot change')
  const flag = await call(page, 'PUT', `${known.base}/squads/${known.squadD}/scores/${bowler}/dnf`)
  expectRefused(flag, 409, 'This squad is complete')
}

/** Everything is complete: moves into or out of a complete squad, a delete with scores. */
export async function refusalsAtTheEnd(page: Page, registrationIds: Map<number, string>) {
  const known = await ids()
  // REG-34, D-203: a bowler cannot leave a squad that has their scores.
  const leave = await call(
    page,
    'PATCH',
    `${known.base}/registrations/${registrationOf(registrationIds, 0)}`,
    { removeSquadIds: [known.squadA] },
  )
  expect(leave.status, JSON.stringify(leave.body)).toBe(400)
  // D-10: nor join a complete squad.
  const join = await call(
    page,
    'PATCH',
    `${known.base}/registrations/${registrationOf(registrationIds, 1)}`,
    { addSquadIds: [known.squadA] },
  )
  expect(join.status, JSON.stringify(join.body)).toBe(400)
  // REG-19, D-211: a registration with a score is not deleted.
  const remove = await call(
    page,
    'DELETE',
    `${known.base}/registrations/${registrationOf(registrationIds, 0)}`,
  )
  expectRefused(remove, 409)
  expect(remove.body.errors).toBeDefined()
}

/** The admin tries to delete a tournament that has scores: refused, with no override (D-133). */
export async function refusalDeleteTournamentWithScores(page: Page) {
  const known = await ids()
  const answer = await call(page, 'DELETE', `/v1/tournaments/${known.main.id}`)
  expectRefused(answer, 409)
  expect(answer.body.errors).toBeDefined()
  const forced = await call(
    page,
    'DELETE',
    `/v1/tournaments/${known.main.id}?confirmWarnings=true&registrations=150&divisions=3&squads=4&sweepers=2`,
  )
  expectRefused(forced, 409)
}
