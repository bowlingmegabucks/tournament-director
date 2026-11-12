import { expect, type Page } from '@playwright/test'
import { tournament } from '../data/tournament'
import { call } from './refusals'
import { ids } from './scriptedFailures'
import { mainMenu } from './signIn'

/** Who is calling: nobody, or a role. */
export type Persona = 'signedOut' | 'scoreKeeper' | 'director' | 'admin'
export const personas: Persona[] = ['signedOut', 'scoreKeeper', 'director', 'admin']

interface ApiCase {
  what: string
  method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE'
  /** The path after `/v1/tournaments/{id}` (or a full path starting `/v1/` when `absolute`). */
  path: string
  absolute?: boolean
  body?: unknown
  /** The status each persona gets. A write gets 400 or 409 when allowed: the body or state refuses it. */
  expect: Record<Persona, number>
}

/**
 * The API's answer to each persona for one route of each kind (docs/requirements/api-access.md).
 * A write is sent with an empty body or on a complete session: a persona that holds the permission
 * is refused for the body or the state (400 or 409), one that does not is refused for access (401
 * signed out, 403 signed in), and nothing is created or changed.
 */
const apiCases = (squadId: string, registrationId: string): ApiCase[] => [
  {
    what: 'public read: divisions',
    method: 'GET',
    path: '/divisions',
    expect: { signedOut: 200, scoreKeeper: 200, director: 200, admin: 200 },
  },
  {
    what: 'registrations list (registrations.read)',
    method: 'GET',
    path: '/registrations',
    expect: { signedOut: 401, scoreKeeper: 200, director: 200, admin: 200 },
  },
  {
    what: 'lane page (lanes.read)',
    method: 'GET',
    path: `/squads/${squadId}/lanes`,
    expect: { signedOut: 401, scoreKeeper: 200, director: 200, admin: 200 },
  },
  {
    what: 'create a tournament (tournaments.write)',
    method: 'POST',
    path: '/v1/tournaments',
    absolute: true,
    body: {},
    expect: { signedOut: 401, scoreKeeper: 403, director: 400, admin: 400 },
  },
  {
    what: 'create a division (divisions.write)',
    method: 'POST',
    path: '/divisions',
    body: {},
    expect: { signedOut: 401, scoreKeeper: 403, director: 400, admin: 400 },
  },
  {
    what: 'save a score in a complete squad (scores.write)',
    method: 'PUT',
    path: `/squads/${squadId}/scores/${registrationId}/1`,
    body: { score: 200 },
    expect: { signedOut: 401, scoreKeeper: 409, director: 409, admin: 409 },
  },
  {
    what: 'move a bowler to a lane (lanes.assign)',
    method: 'PUT',
    path: `/squads/${squadId}/lanes/${registrationId}`,
    body: { lane: 1 },
    expect: { signedOut: 401, scoreKeeper: 403, director: 409, admin: 409 },
  },
  {
    what: 'delete the tournament (tournaments.delete)',
    method: 'DELETE',
    path: '',
    expect: { signedOut: 401, scoreKeeper: 403, director: 403, admin: 409 },
  },
  {
    what: 'list users (users.manage)',
    method: 'GET',
    path: '/v1/users',
    absolute: true,
    expect: { signedOut: 401, scoreKeeper: 403, director: 403, admin: 200 },
  },
]

/** Make every call of the matrix as the signed-in (or signed-out) browser and check the statuses. */
export async function checkApiAccess(
  page: Page,
  persona: Persona,
  registrationIds: Map<number, string>,
) {
  const known = await ids()
  const registrationId = registrationIds.get(1)
  if (!registrationId) throw new Error('No registration id for bowler 1')
  for (const item of apiCases(known.squadD, registrationId)) {
    const path = item.absolute ? item.path : `${known.base}${item.path}`
    const answer = await call(page, item.method, path, item.body)
    expect(answer.status, `${persona}: ${item.what} ${JSON.stringify(answer.body)}`).toBe(
      item.expect[persona],
    )
  }
}

/**
 * What the pages show each persona. The tournament overview and its sidebar: links appear only for
 * a user who holds the permission, and the top bar says who is signed in (D-102).
 */
export async function checkPagesShown(page: Page, persona: Persona) {
  await page.goto('/')
  await mainMenu(page).getByRole('link', { name: 'Tournaments' }).click()
  await page.getByRole('article').filter({ hasText: tournament.name }).getByRole('link').click()
  await expect(page.getByRole('heading', { name: tournament.name, level: 1 })).toBeVisible()
  const sidebar = page.getByRole('navigation', { name: tournament.name })
  const main = page.getByRole('navigation', { name: 'Main' })
  const signedIn = persona !== 'signedOut'
  const can = {
    registrations: signedIn,
    edit: persona === 'director' || persona === 'admin',
    delete: persona === 'admin',
    users: persona === 'admin',
  }

  // Public pages are always there.
  for (const link of ['Divisions', 'Squads', 'Sweepers', 'Live results', 'At-large', 'Seeding']) {
    await expect(sidebar.getByRole('link', { name: link })).toBeVisible()
  }
  await expect(sidebar.getByRole('link', { name: 'Registrations' })).toHaveCount(
    can.registrations ? 1 : 0,
  )
  await expect(page.getByRole('link', { name: 'Edit tournament' })).toHaveCount(can.edit ? 1 : 0)
  await expect(page.getByRole('button', { name: 'Delete tournament' })).toHaveCount(
    can.delete ? 1 : 0,
  )
  await expect(main.getByRole('link', { name: 'Sign in' })).toHaveCount(signedIn ? 0 : 1)
  await expect(main.getByRole('link', { name: 'Users' })).toHaveCount(can.users ? 1 : 0)
}
