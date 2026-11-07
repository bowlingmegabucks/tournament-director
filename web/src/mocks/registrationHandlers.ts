import { http, HttpResponse } from 'msw'
import { faker } from '@faker-js/faker'
import type { Division } from '../features/divisions/types'
import type {
  BowlerRegistration,
  BowlerSearchResult,
  BowlerValues,
  DeskRegistrationRequest,
  RegistrationList,
} from '../features/registrations/types'
import type { Squad } from '../features/squads/types'
import type { Tournament } from '../features/tournaments/types'
import { createRegistration } from './data'

interface MockBowler extends BowlerValues {
  id: string
}

interface MockRegistration {
  id: string
  bowlerId: string
  divisionId: string
  average: number | null
  superSweeper: boolean
  squadIds: string[]
  sweeperIds: string[]
  hasScores: boolean
}

function bowler(
  fields: Partial<MockBowler> & Pick<MockBowler, 'firstName' | 'lastName'>,
): MockBowler {
  return {
    id: faker.string.uuid(),
    middleInitial: '',
    suffix: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    email: '',
    phoneNumber: '',
    usbcId: '',
    dateOfBirth: '',
    gender: '',
    ...fields,
  }
}

const displayName = (b: BowlerValues) =>
  b.suffix === '' ? `${b.firstName} ${b.lastName}` : `${b.firstName} ${b.lastName}, ${b.suffix}`

const sameText = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' }) === 0
const startsWith = (value: string, prefix: string) =>
  sameText(value.slice(0, prefix.length), prefix)

interface World {
  tournaments: Tournament[]
  divisions: Division[]
  squads: Squad[]
  registrations: RegistrationList
}

/**
 * The desk's add-registration routes for the mock server (D-157). It keeps its own bowlers, built
 * from the registration list plus a few that are not registered, and changes the list when a
 * registration is saved, so a test can add one and see the row. It follows the API's rules the
 * desk cares about (names, handicap USBC ID, squads, the two conflicts, a division move after
 * scores) and never completes a tournament: the API tests cover the rest.
 */
export function createRegistrationHandlers({
  tournaments,
  divisions,
  squads,
  registrations,
}: World) {
  const bowlers: MockBowler[] = [
    bowler({
      firstName: 'Maria',
      lastName: 'Gonzalez',
      street: '14 Elm Street',
      city: 'Worcester',
      state: 'MA',
      zipCode: '01604',
      email: 'maria.g@example.com',
      phoneNumber: '5085550142',
      usbcId: '1234-56789',
      dateOfBirth: '1984-03-09',
      gender: 'Female',
    }),
    bowler({ firstName: 'Maria', lastName: 'Gonzales', city: 'Quincy', state: 'MA' }),
    bowler({
      firstName: 'Maria',
      lastName: 'Gonzalez',
      suffix: 'Jr',
      city: 'Albany',
      state: 'NY',
      usbcId: '2233-44556',
    }),
    bowler({
      firstName: 'Race',
      lastName: 'Runner',
      city: 'Boston',
      state: 'MA',
      usbcId: '7000-10001',
    }),
    // Registered, with a score: the division is locked (D-160).
    bowler({
      firstName: 'Sam',
      lastName: 'Scored',
      city: 'Lowell',
      state: 'MA',
      usbcId: '8000-20002',
    }),
  ]
  const stored: MockRegistration[] = []
  // Becomes registered the moment someone saves for it, so the desk meets a conflict it could not see (D-159).
  const racing = new Set(
    bowlers.filter((candidate) => candidate.lastName === 'Runner').map((b) => b.id),
  )

  // The bowlers of the demo list are stored bowlers too, registered in their division.
  for (const entry of registrations.registrations) {
    bowlers.push(
      bowler({
        id: entry.bowler.id,
        firstName: entry.bowler.firstName,
        lastName: entry.bowler.lastName,
        usbcId: entry.bowler.usbcId,
        city: 'Worcester',
        state: 'MA',
      }),
    )
    stored.push({
      id: entry.id,
      bowlerId: entry.bowler.id,
      divisionId: entry.divisionId,
      average: 190,
      superSweeper: entry.superSweeper,
      squadIds: [...entry.squadIds],
      sweeperIds: [...entry.sweeperIds],
      hasScores: false,
    })
  }
  const sam = bowlers.find((candidate) => candidate.lastName === 'Scored')
  const open = squads.find((squad) => !squad.complete)
  const firstDivision = divisions[0]
  if (sam && firstDivision && open) {
    const entry = createRegistration({
      bowler: {
        id: sam.id,
        name: displayName(sam),
        firstName: 'Sam',
        lastName: 'Scored',
        usbcId: sam.usbcId,
      },
      divisionId: firstDivision.id,
      divisionName: firstDivision.name,
      squadIds: [open.id],
    })
    registrations.registrations.push(entry)
    registrations.summary.registrations += 1
    stored.push({
      id: entry.id,
      bowlerId: sam.id,
      divisionId: firstDivision.id,
      average: 185,
      superSweeper: false,
      squadIds: [open.id],
      sweeperIds: [],
      hasScores: true,
    })
  }

  const tournamentExists = (id: unknown) => tournaments.some((candidate) => candidate.id === id)
  const registrationOf = (bowlerId: string) => stored.find((entry) => entry.bowlerId === bowlerId)
  const divisionName = (id: string) => divisions.find((division) => division.id === id)?.name ?? ''

  function toSearchResult(candidate: MockBowler): BowlerSearchResult {
    const registration = registrationOf(candidate.id)
    return {
      id: candidate.id,
      name: displayName(candidate),
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      usbcId: candidate.usbcId,
      city: candidate.city,
      state: candidate.state,
      registered:
        registration && !racing.has(candidate.id)
          ? { divisionName: divisionName(registration.divisionId) }
          : null,
    }
  }

  function toRegistration(entry: MockRegistration): BowlerRegistration {
    return {
      id: entry.id,
      divisionId: entry.divisionId,
      divisionName: divisionName(entry.divisionId),
      average: entry.average,
      superSweeper: entry.superSweeper,
      squadIds: entry.squadIds,
      sweeperIds: entry.sweeperIds,
      hasScores: entry.hasScores,
    }
  }

  const reject = (errors: Record<string, string>) =>
    HttpResponse.json(
      { message: Object.values(errors)[0] ?? 'Invalid request', errors },
      { status: 400 },
    )

  function syncList(entry: MockRegistration, owner: MockBowler, created: boolean) {
    const row = registrations.registrations.find((candidate) => candidate.id === entry.id)
    const next = {
      id: entry.id,
      bowler: {
        id: owner.id,
        name: displayName(owner),
        firstName: owner.firstName,
        lastName: owner.lastName,
        usbcId: owner.usbcId,
      },
      divisionId: entry.divisionId,
      divisionName: divisionName(entry.divisionId),
      squadIds: [...entry.squadIds],
      sweeperIds: [...entry.sweeperIds],
      superSweeper: entry.superSweeper,
    }
    if (row) Object.assign(row, next)
    else registrations.registrations.push(next)
    if (created) registrations.summary.registrations += 1
    registrations.registrations.sort((a, b) =>
      (a.bowler.lastName + a.bowler.firstName).localeCompare(
        b.bowler.lastName + b.bowler.firstName,
      ),
    )
  }

  return [
    http.get('/v1/bowlers', ({ request }) => {
      const query = new URL(request.url).searchParams
      const lastName = query.get('lastName')?.trim() ?? ''
      const firstName = query.get('firstName')?.trim() ?? ''
      const email = query.get('email')?.trim() ?? ''
      const usbcId = query.get('usbcId')?.trim() ?? ''
      if (lastName === '' && firstName === '' && email === '' && usbcId === '') {
        return HttpResponse.json({ message: 'Enter at least one search field.' }, { status: 400 })
      }
      const found = bowlers
        .filter(
          (candidate) =>
            (lastName === '' || startsWith(candidate.lastName, lastName)) &&
            (firstName === '' || startsWith(candidate.firstName, firstName)) &&
            (email === '' || sameText(candidate.email, email)) &&
            (usbcId === '' || sameText(candidate.usbcId, usbcId)),
        )
        .map(toSearchResult)
        .sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName))
      return HttpResponse.json({ bowlers: found.slice(0, 25), more: found.length > 25 })
    }),

    http.get('/v1/bowlers/:id', ({ params }) => {
      const found = bowlers.find((candidate) => candidate.id === params['id'])
      if (!found) return HttpResponse.json({ message: 'Bowler not found' }, { status: 404 })
      const registration = racing.has(found.id) ? undefined : registrationOf(found.id)
      return HttpResponse.json({
        bowler: found,
        registration: registration ? toRegistration(registration) : null,
      })
    }),

    http.post('/v1/tournaments/:id/registrations', async ({ params, request }) => {
      if (!tournamentExists(params['id'])) {
        return HttpResponse.json({ message: 'Tournament not found' }, { status: 404 })
      }
      const body = (await request.json()) as DeskRegistrationRequest
      const errors: Record<string, string> = {}
      const stored_ = body.bowlerId
        ? bowlers.find((candidate) => candidate.id === body.bowlerId)
        : undefined
      if (body.bowlerId && !stored_) {
        return HttpResponse.json({ message: 'Bowler not found' }, { status: 404 })
      }
      const typed = { ...(stored_ ?? {}), ...body.bowler } as BowlerValues
      if ((typed.firstName ?? '').trim() === '')
        errors['bowler.firstName'] = 'First Name is Required'
      if ((typed.lastName ?? '').trim() === '') errors['bowler.lastName'] = 'Last Name is Required'
      const division = divisions.find((candidate) => candidate.id === body.divisionId)
      if (!division) errors['divisionId'] = 'The specified division does not exist.'
      if (division?.handicapPercentage != null && (typed.usbcId ?? '') === '') {
        errors['bowler.usbcId'] = 'USBC Id is required for Handicap Divisions'
      }
      const existing = stored_ ? registrationOf(stored_.id) : undefined
      const heldCount = existing ? existing.squadIds.length : 0
      if (body.squadIds.length + heldCount === 0) {
        errors['squadIds'] = 'Bowler must enter at least one squad'
      }
      for (const id of body.squadIds) {
        const squad = squads.find((candidate) => candidate.id === id)
        if (!squad) errors['squadIds'] = 'Invalid squad IDs'
        else if (squad.complete)
          errors['squadIds'] = 'Cannot add squad(s) that are already complete.'
      }
      if (Object.keys(errors).length > 0) return reject(errors)

      // D-161: an exact USBC ID match for a new bowler.
      const typedUsbc = (body.bowler.usbcId ?? '').trim()
      if (!body.bowlerId && typedUsbc !== '') {
        const onFile = bowlers.find((candidate) => sameText(candidate.usbcId, typedUsbc))
        if (onFile) {
          return HttpResponse.json(
            {
              message: 'A bowler with this USBC ID is on file.',
              conflict: 'usbcIdOnFile',
              bowler: { id: onFile.id, name: displayName(onFile) },
            },
            { status: 409 },
          )
        }
      }

      // The racing bowler gets registered by "someone else" the first time the desk saves (D-159).
      if (stored_ && racing.has(stored_.id) && !existing) {
        racing.delete(stored_.id)
        const first = squads.find((squad) => !squad.complete)
        if (first && division) {
          const entry: MockRegistration = {
            id: faker.string.uuid(),
            bowlerId: stored_.id,
            divisionId: division.id,
            average: 180,
            superSweeper: false,
            squadIds: [first.id],
            sweeperIds: [],
            hasScores: false,
          }
          stored.push(entry)
          syncList(entry, stored_, true)
          return conflictOf(entry)
        }
      }

      const owner =
        stored_ ??
        bowler({
          firstName: '',
          lastName: '',
        })
      if (stored_) {
        for (const [key, value] of Object.entries(body.bowler)) {
          if (typeof value === 'string' && value.trim() !== '')
            Object.assign(stored_, { [key]: value })
        }
      } else {
        Object.assign(owner, body.bowler)
        bowlers.push(owner)
      }

      if (existing && body.appendToExisting !== true) return conflictOf(existing)
      if (existing && division) {
        if (existing.divisionId !== division.id && existing.hasScores) {
          return reject({
            divisionId: 'Cannot change bowler division after scores have been recorded.',
          })
        }
        if (body.squadIds.some((id) => existing.squadIds.includes(id))) {
          return reject({ squadIds: 'The specified squads are already registered.' })
        }
        existing.divisionId = division.id
        existing.average = body.average ?? existing.average
        existing.superSweeper = body.superSweeper
        existing.squadIds.push(...body.squadIds)
        existing.sweeperIds.push(...body.sweeperIds)
        syncList(existing, owner, false)
        return HttpResponse.json({ registrationId: existing.id, mode: 'appended' }, { status: 201 })
      }
      const entry: MockRegistration = {
        id: faker.string.uuid(),
        bowlerId: owner.id,
        divisionId: body.divisionId,
        average: body.average,
        superSweeper: body.superSweeper,
        squadIds: [...body.squadIds],
        sweeperIds: [...body.sweeperIds],
        hasScores: false,
      }
      stored.push(entry)
      syncList(entry, owner, true)
      return HttpResponse.json({ registrationId: entry.id, mode: 'created' }, { status: 201 })
    }),
  ]

  function conflictOf(entry: MockRegistration) {
    return HttpResponse.json(
      {
        message: 'Bowler is already registered for this tournament.',
        conflict: 'alreadyRegistered',
        existing: {
          registrationId: entry.id,
          divisionId: entry.divisionId,
          divisionName: divisionName(entry.divisionId),
          squadIds: entry.squadIds,
          sweeperIds: entry.sweeperIds,
        },
      },
      { status: 409 },
    )
  }
}
