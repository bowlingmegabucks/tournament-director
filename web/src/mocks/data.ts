import { faker } from '@faker-js/faker'
import type { Division } from '../features/divisions/types'
import type { Registration, RegistrationList } from '../features/registrations/types'
import type { Squad } from '../features/squads/types'
import type { Sweeper } from '../features/sweepers/types'
import type { Tournament } from '../features/tournaments/types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function createTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: faker.string.uuid(),
    name: `${faker.location.city()} Open`,
    startDate: '2026-10-23',
    endDate: '2026-10-25',
    entryFee: faker.number.int({ min: 20, max: 120 }),
    bowlingCenter: `${faker.company.name()} Lanes`,
    ...overrides,
  }
}

export function createDivision(overrides: Partial<Division> = {}): Division {
  return {
    id: faker.string.uuid(),
    number: faker.number.int({ min: 1, max: 20 }),
    name: faker.word.noun(),
    gender: null,
    minimumAge: null,
    maximumAge: null,
    minimumAverage: null,
    maximumAverage: null,
    handicapPercentage: null,
    handicapBase: null,
    maximumHandicapPerGame: null,
    ...overrides,
  }
}

/** For the mock server: Open, Women, Seniors, and Scratch, as a bowling center might set them up. */
export function createDemoDivisions(): Division[] {
  return [
    createDivision({ number: 1, name: 'Open', handicapPercentage: 90, handicapBase: 220 }),
    createDivision({
      number: 2,
      name: 'Women',
      gender: 'Female',
      maximumAverage: 199,
      handicapPercentage: 90,
      handicapBase: 220,
      maximumHandicapPerGame: 40,
    }),
    createDivision({
      number: 3,
      name: 'Seniors',
      minimumAge: 50,
      minimumAverage: 150,
      maximumAverage: 189,
      handicapPercentage: 80,
      handicapBase: 210,
    }),
    createDivision({
      number: 4,
      name: 'Scratch',
      minimumAge: 18,
      maximumAge: 39,
      minimumAverage: 200,
    }),
  ]
}

export function createSquad(overrides: Partial<Squad> = {}): Squad {
  return {
    id: faker.string.uuid(),
    date: '2026-10-24T09:00:00',
    complete: false,
    startingLane: 1,
    numberOfLanes: 24,
    maxPerPair: 4,
    entryFee: 50,
    entryFeeOverridden: false,
    finalsRatio: 7,
    finalsRatioOverridden: false,
    cashRatio: 5,
    cashRatioOverridden: false,
    ...overrides,
  }
}

export function createSweeper(overrides: Partial<Sweeper> = {}): Sweeper {
  return {
    id: faker.string.uuid(),
    date: '2026-10-24T18:00:00',
    complete: false,
    startingLane: 1,
    numberOfLanes: 12,
    maxPerPair: 4,
    entryFee: 25,
    games: 3,
    cashRatio: 4,
    bonusPins: [],
    ...overrides,
  }
}

/** For the mock server: a finished morning squad, an afternoon squad that overrides, and a smaller Sunday one. */
export function createDemoSquads(): Squad[] {
  return [
    createSquad({ date: '2026-10-24T09:00:00', complete: true }),
    createSquad({
      date: '2026-10-24T13:00:00',
      entryFee: 60,
      entryFeeOverridden: true,
      finalsRatio: 8,
      finalsRatioOverridden: true,
    }),
    createSquad({
      date: '2026-10-25T09:00:00',
      startingLane: 11,
      numberOfLanes: 10,
      maxPerPair: 5,
    }),
  ]
}

/** For the mock server: one sweeper with pins on two divisions, one with pins on only one. */
export function createDemoSweepers(divisions: Division[]): Sweeper[] {
  const [open, women] = divisions
  const pins = (division: Division | undefined, bonusPinsPerGame: number) =>
    division ? [{ divisionId: division.id, divisionName: division.name, bonusPinsPerGame }] : []
  return [
    createSweeper({
      date: '2026-10-24T18:00:00',
      bonusPins: [...pins(open, 10), ...pins(women, 6)],
    }),
    createSweeper({
      date: '2026-10-25T17:00:00',
      complete: true,
      entryFee: 30,
      games: 4,
      cashRatio: 5,
      bonusPins: pins(women, 6),
    }),
  ]
}

export function createRegistration(overrides: Partial<Registration> = {}): Registration {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  return {
    id: faker.string.uuid(),
    bowler: {
      id: faker.string.uuid(),
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      usbcId: `${faker.string.numeric(4)}-${faker.string.numeric(5)}`,
    },
    divisionId: faker.string.uuid(),
    divisionName: 'Open',
    squadIds: [],
    sweeperIds: [],
    superSweeper: false,
    ...overrides,
  }
}

// Who is in the demo list: the division, squads, and sweepers are positions in the demo lists.
interface DemoBowler {
  first: string
  last: string
  suffix?: string
  usbc: string
  division: number
  squads: number[]
  sweepers: number[]
  superSweeper: boolean
}

const demoBowlers: DemoBowler[] = [
  {
    first: 'Dana',
    last: 'Abbott',
    usbc: '4821-10394',
    division: 0,
    squads: [0, 1],
    sweepers: [0, 1],
    superSweeper: true,
  },
  {
    first: 'Ray',
    last: 'Baptiste',
    suffix: 'Jr',
    usbc: '1190-55820',
    division: 0,
    squads: [0],
    sweepers: [],
    superSweeper: false,
  },
  {
    first: 'Maria',
    last: 'Chen',
    usbc: '3377-20418',
    division: 1,
    squads: [0, 1],
    sweepers: [0, 1],
    superSweeper: true,
  },
  {
    first: 'Tom',
    last: 'Delgado',
    usbc: '',
    division: 0,
    squads: [1],
    sweepers: [0],
    superSweeper: false,
  },
  {
    first: 'Joe',
    last: 'Fontaine',
    usbc: '2045-88123',
    division: 0,
    squads: [0, 1],
    sweepers: [],
    superSweeper: false,
  },
  {
    first: 'Joe',
    last: 'Fontaine',
    usbc: '5560-11902',
    division: 1,
    squads: [1],
    sweepers: [],
    superSweeper: false,
  },
]

/**
 * For the mock server: six bowlers in the demo divisions, sorted as the API sorts, with the summary
 * counted from them. The third squad has no entries.
 */
export function createDemoRegistrationList(
  divisions: Division[],
  squads: Squad[],
  sweepers: Sweeper[],
): RegistrationList {
  const registrations = demoBowlers.map(({ first, last, suffix, usbc, division, ...entered }) => {
    const name = `${first} ${last}`
    return createRegistration({
      bowler: {
        id: faker.string.uuid(),
        name: suffix ? `${name}, ${suffix}` : name,
        firstName: first,
        lastName: last,
        usbcId: usbc,
      },
      divisionId: divisions[division]?.id ?? '',
      divisionName: divisions[division]?.name ?? '',
      squadIds: entered.squads.flatMap((position) => squads[position]?.id ?? []),
      sweeperIds: entered.sweepers.flatMap((position) => sweepers[position]?.id ?? []),
      superSweeper: entered.superSweeper,
    })
  })
  const entries = (position: number, key: 'squads' | 'sweepers') =>
    demoBowlers.filter((bowler) => bowler[key].includes(position)).length
  return {
    registrations,
    summary: {
      registrations: registrations.length,
      superSweepers: registrations.filter((registration) => registration.superSweeper).length,
      divisions: divisions.map(({ id, number, name }, position) => ({
        id,
        number,
        name,
        entries: demoBowlers
          .filter((bowler) => bowler.division === position)
          .reduce((total, bowler) => total + bowler.squads.length, 0),
      })),
      squads: squads.map(({ id, date, complete }, position) => ({
        id,
        date,
        complete,
        entries: entries(position, 'squads'),
      })),
      sweepers: sweepers.map(({ id, date, complete }, position) => ({
        id,
        date,
        complete,
        entries: entries(position, 'sweepers'),
      })),
    },
  }
}

export function createTournaments(count = 5): Tournament[] {
  return Array.from({ length: count }, () => createTournament())
}

function localIso(time: number): string {
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * For the mock server: one tournament in progress and three past, relative to today,
 * so both list groups and Home always have something to show.
 */
export function createDemoTournaments(now: Date = new Date()): Tournament[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const inProgressStart = today - MS_PER_DAY
  return [0, 1, 2, 3].map((index) => {
    const start = index === 0 ? inProgressStart : today - index * 365 * MS_PER_DAY
    return createTournament({
      name: `${new Date(start).getFullYear()} Northeast MegaBuck$ Tournament`,
      startDate: localIso(start),
      endDate: localIso(start + 2 * MS_PER_DAY),
      entryFee: 50,
      bowlingCenter: 'Spare Time Lanes, Worcester MA',
    })
  })
}
