import { faker } from '@faker-js/faker'
import type { Division } from '../features/divisions/types'
import type { LaneBowler, LanePage, LanePair, SessionKind } from '../features/lanes/types'
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

/** A test that overrides only `name` gets a first and last name read from it: "Joe Fontaine, Jr" is Joe, Fontaine. */
export function createLaneBowler(overrides: Partial<LaneBowler> = {}): LaneBowler {
  const parts = overrides.name?.split(' ')
  const firstName = overrides.firstName ?? parts?.[0] ?? faker.person.firstName()
  const lastName =
    overrides.lastName ?? parts?.slice(1).join(' ').split(',')[0] ?? faker.person.lastName()
  return {
    registrationId: faker.string.uuid(),
    name: `${firstName} ${lastName}`,
    firstName,
    lastName,
    divisionId: faker.string.uuid(),
    divisionName: 'Open',
    average: 200,
    position: '',
    pins: 0,
    superSweeper: false,
    ...overrides,
  }
}

/** A pair with its lanes worked out from its first lane, as the API sends it. */
export function createLanePair(
  firstLane: number,
  bowlers: LaneBowler[] = [],
  capacity = 5,
): LanePair {
  return { firstLane, lanes: [firstLane, firstLane + 1], capacity, bowlers }
}

/** A lane page for a session of 10 lanes from lane 1, with five bowlers per pair. Override what a test cares about. */
export function createLanePage(overrides: Partial<LanePage> = {}): LanePage {
  const { session, ...rest } = overrides
  const startingLane = session?.startingLane ?? 1
  const numberOfLanes = session?.numberOfLanes ?? 10
  const maxPerPair = session?.maxPerPair ?? 5
  return {
    session: {
      id: faker.string.uuid(),
      kind: 'squad',
      date: '2026-10-24T09:00:00',
      complete: false,
      startingLane,
      numberOfLanes,
      maxPerPair,
      ...session,
    },
    pairs: Array.from({ length: Math.floor(numberOfLanes / 2) }, (_, index) =>
      createLanePair(startingLane + 2 * index, [], maxPerPair),
    ),
    unassigned: [],
    other: [],
    divisions: [],
    ...rest,
  }
}

// Who is on the demo lane page. `pair` counts from the session's first pair; the seat letter says
// which lane of the pair (A and B are the odd lane, C to E the even one, D-56).
interface DemoLaneBowler {
  first: string
  last: string
  division: number
  average: number | null
  seat?: { pair: number; letter: 'A' | 'B' | 'C' | 'D' | 'E' }
  superSweeper: boolean
}

const demoLaneBowlers: DemoLaneBowler[] = [
  {
    first: 'Joe',
    last: 'Fontaine',
    division: 0,
    average: 212,
    seat: { pair: 0, letter: 'A' },
    superSweeper: true,
  },
  {
    first: 'Dana',
    last: 'Abbott',
    division: 0,
    average: 201,
    seat: { pair: 0, letter: 'C' },
    superSweeper: false,
  },
  {
    first: 'Maria',
    last: 'Chen',
    division: 1,
    average: 168,
    seat: { pair: 0, letter: 'B' },
    superSweeper: true,
  },
  {
    first: 'Ray',
    last: 'Baptiste',
    division: 0,
    average: 190,
    seat: { pair: 0, letter: 'D' },
    superSweeper: false,
  },
  {
    first: 'Tom',
    last: 'Delgado',
    division: 0,
    average: 205,
    seat: { pair: 1, letter: 'A' },
    superSweeper: false,
  },
  {
    first: 'Priya',
    last: 'Nair',
    division: 2,
    average: 175,
    seat: { pair: 1, letter: 'C' },
    superSweeper: false,
  },
  {
    first: 'Wes',
    last: 'Tanaka',
    division: 0,
    average: 190,
    seat: { pair: 2, letter: 'A' },
    superSweeper: false,
  },
  { first: 'Pat', last: 'Nguyen', division: 1, average: 168, superSweeper: true },
  { first: 'Carl', last: 'Dubois', division: 0, average: 205, superSweeper: false },
  { first: 'Rosa', last: 'Delgado', division: 3, average: 231, superSweeper: true },
  { first: 'Sam', last: 'Okafor', division: 2, average: null, superSweeper: false },
]

const lanePins = (kind: SessionKind, division: Division | undefined, average: number | null) => {
  if (kind === 'sweeper') return division?.name === 'Women' ? 6 : division?.name === 'Open' ? 10 : 0
  const base = division?.handicapBase
  const percent = division?.handicapPercentage
  if (average === null || !base || !percent || average >= base) return 0
  return Math.min(
    Math.floor(((base - average) * percent) / 100),
    division.maximumHandicapPerGame ?? 999,
  )
}

/**
 * For the mock server: the lane page of a demo squad or sweeper. Eight bowlers sit on the first
 * three pairs and three wait, so the page shows both areas. Positions follow the session's lanes.
 */
export function createDemoLanePage(
  kind: SessionKind,
  session: Pick<
    LanePage['session'],
    'id' | 'date' | 'complete' | 'startingLane' | 'numberOfLanes' | 'maxPerPair'
  >,
  divisions: Division[],
): LanePage {
  const page = createLanePage({ session: { ...session, kind } })
  const unassigned: LaneBowler[] = []
  for (const demo of demoLaneBowlers) {
    const division = divisions[demo.division]
    const bowler = createLaneBowler({
      name: `${demo.first} ${demo.last}`,
      firstName: demo.first,
      lastName: demo.last,
      divisionId: division?.id ?? '',
      divisionName: division?.name ?? '',
      average: demo.average,
      pins: lanePins(kind, division, demo.average),
      superSweeper: demo.superSweeper,
    })
    const pair = demo.seat ? page.pairs[demo.seat.pair] : undefined
    if (!demo.seat || !pair) {
      unassigned.push(bowler)
      continue
    }
    const lane = pair.firstLane + (['C', 'D', 'E'].includes(demo.seat.letter) ? 1 : 0)
    pair.bowlers.push({ ...bowler, position: `${lane}${demo.seat.letter}` })
  }
  for (const pair of page.pairs) {
    pair.bowlers.sort((a, b) => a.position.localeCompare(b.position, 'en', { numeric: true }))
  }
  page.unassigned = unassigned.sort(
    (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
  )
  page.divisions = divisions.map(({ id, number, name }, index) => ({
    id,
    number,
    name,
    entries: demoLaneBowlers.filter((bowler) => bowler.division === index).length,
  }))
  return page
}
