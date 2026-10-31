import { faker } from '@faker-js/faker'
import type { Division } from '../features/divisions/types'
import type { LaneBowler, LanePage, LanePair } from '../features/lanes/types'
import type { SessionKind } from '../shared/session'
import type { RecapSheet, RecapSheets } from '../features/recapSheets/types'
import type { Registration, RegistrationList } from '../features/registrations/types'
import type {
  AtLargeDivision,
  AtLargeResults,
  AtLargeRow,
  DivisionResult,
  SeedingDivision,
  SeedingResults,
  SeedingRow,
  SquadResults,
  SquadRow,
  SuperSweeperResults,
  SuperSweeperRow,
  SweeperResults,
  SweeperRow,
} from '../features/results/types'
import type { ScoreBowler, ScorePage, ScorePair } from '../features/scores/types'
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
    games: 3,
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
  if (kind === 'sweeper') {
    if (division?.name === 'Women') return 6
    return division?.name === 'Open' ? 10 : 0
  }
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
  page.unassigned = unassigned.toSorted(
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

/** A recap sheet for one bowler (RPT-05). Three games, handicap 47, the same lanes both ways. */
export function createRecapSheet(overrides: Partial<RecapSheet> = {}): RecapSheet {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  return {
    registrationId: faker.string.uuid(),
    name: `${firstName} ${lastName}`,
    divisionName: 'Open',
    position: '1A',
    handicap: 47,
    cross: { staggered: ['1A', '4A', '7A'], same: ['1A', '4A', '5A'] },
    ...overrides,
  }
}

/** The recap sheets of a session, with the session facts the sheet prints. */
export function createRecapSheets(overrides: Partial<RecapSheets> = {}): RecapSheets {
  const { session, ...rest } = overrides
  return {
    session: {
      id: faker.string.uuid(),
      kind: 'squad',
      date: '2026-10-24T09:00:00',
      games: 3,
      complete: false,
      ...session,
    },
    sheets: [],
    withoutLane: 0,
    withoutDivision: 0,
    ...rest,
  }
}

/**
 * For the mock server: the recap sheets of a demo squad or sweeper, from the demo lane page. The
 * lanes are made up (each game moves two lanes on, wrapping over the first six lanes) because the
 * real cross lives in the API. The pages only show what the API sends.
 */
export function createDemoRecapSheets(
  kind: SessionKind,
  session: Parameters<typeof createDemoLanePage>[1] & { games: number },
  divisions: Division[],
): RecapSheets {
  const page = createDemoLanePage(kind, session, divisions)
  const sheets = page.pairs.flatMap((pair) =>
    pair.bowlers.map((bowler) => {
      const lane = Number.parseInt(bowler.position, 10)
      const letter = bowler.position.slice(String(lane).length)
      const cross = (step: number) =>
        Array.from(
          { length: session.games },
          (_, game) => `${((lane - 1 + game * step) % 6) + 1}${letter}`,
        )
      return createRecapSheet({
        registrationId: bowler.registrationId,
        name: bowler.name,
        divisionName: bowler.divisionName,
        position: bowler.position,
        handicap: bowler.pins,
        cross: { staggered: cross(3), same: cross(2) },
      })
    }),
  )
  return createRecapSheets({
    session: {
      id: session.id,
      kind,
      date: session.date,
      games: session.games,
      complete: session.complete,
    },
    sheets,
    withoutLane: page.unassigned.length + page.other.length,
  })
}

/** A bowler on the Scores tab. Three empty games unless a test sends `scores`; the total follows them. */
export function createScoreBowler(overrides: Partial<ScoreBowler> = {}): ScoreBowler {
  const scores = overrides.scores ?? [null, null, null]
  return {
    registrationId: faker.string.uuid(),
    name: `${faker.person.firstName()} ${faker.person.lastName()}`,
    divisionName: 'Open',
    position: '',
    scores,
    total: scores.reduce<number>((sum, score) => sum + (score ?? 0), 0),
    ...overrides,
  }
}

/** A pair with its lanes worked out from its first lane, as the API sends it. */
export function createScorePair(firstLane: number, bowlers: ScoreBowler[] = []): ScorePair {
  return { firstLane, lanes: [firstLane, firstLane + 1], bowlers }
}

/** A Scores page for a 3-game squad with nobody on it. Override what a test cares about. */
export function createScorePage(overrides: Partial<ScorePage> = {}): ScorePage {
  const { session, ...rest } = overrides
  return {
    session: {
      id: faker.string.uuid(),
      kind: 'squad',
      date: '2026-10-24T09:00:00',
      complete: false,
      games: 3,
      ...session,
    },
    pairs: [],
    noLane: 0,
    other: [],
    ...rest,
  }
}

/**
 * For the mock server: the Scores page of a demo squad or sweeper, laid over its demo lane page.
 * An open session is part scored: the first bowler has every game, the next two games, the next
 * one, and the rest none. A complete session has every game, and one no-show with zeros.
 */
export function createDemoScorePage(
  kind: SessionKind,
  session: Parameters<typeof createDemoLanePage>[1],
  divisions: Division[],
): ScorePage {
  const lanePage = createDemoLanePage(kind, session, divisions)
  const games = 3
  let index = 0
  const toScoreBowler = (bowler: LaneBowler): ScoreBowler => {
    const bowled = session.complete ? games : Math.max(games - index, 0)
    const noShow = session.complete && index === 1
    const scores = Array.from({ length: games }, (_, game) => {
      if (game >= bowled) return null
      return noShow ? 0 : 160 + ((index * 37 + game * 23) % 90)
    })
    index += 1
    return createScoreBowler({
      registrationId: bowler.registrationId,
      name: bowler.name,
      divisionName: bowler.divisionName,
      position: bowler.position,
      scores,
    })
  }
  return createScorePage({
    session: { id: session.id, kind, date: session.date, complete: session.complete, games },
    pairs: lanePage.pairs
      .filter((pair) => pair.bowlers.length > 0)
      .map((pair) => createScorePair(pair.firstLane, pair.bowlers.map(toScoreBowler))),
    noLane: lanePage.unassigned.length,
    other: lanePage.other.map(toScoreBowler),
  })
}

/** A placed bowler of a squad division. Three games of 200, no handicap, no tie, not an earlier advancer. */
export function createSquadRow(overrides: Partial<SquadRow> = {}): SquadRow {
  return {
    registrationId: faker.string.uuid(),
    name: `${faker.person.firstName()} ${faker.person.lastName()}`,
    place: 1,
    group: 'other',
    total: 600,
    highGame: 200,
    games: 3,
    handicap: 0,
    advancedEarlier: false,
    ties: [],
    ...overrides,
  }
}

/** One division of squad results with no one in it. Override the rows and flags a test cares about. */
export function createDivisionResult(overrides: Partial<DivisionResult> = {}): DivisionResult {
  return {
    id: faker.string.uuid(),
    number: 1,
    name: 'Open',
    entries: 0,
    showHandicap: false,
    showGames: false,
    rows: [],
    didNotFinish: [],
    noShows: [],
    ...overrides,
  }
}

/** Squad results for a 3-game squad. Override what a test cares about. */
export function createSquadResults(overrides: Partial<SquadResults> = {}): SquadResults {
  const { session, ...rest } = overrides
  return {
    session: {
      id: faker.string.uuid(),
      kind: 'squad',
      date: '2026-10-24T09:00:00',
      complete: false,
      games: 3,
      ...session,
    },
    finalsRatio: 8,
    cashRatio: 5,
    divisions: [],
    ...rest,
  }
}

/** A placed bowler of a sweeper. */
export function createSweeperRow(overrides: Partial<SweeperRow> = {}): SweeperRow {
  return {
    registrationId: faker.string.uuid(),
    name: `${faker.person.firstName()} ${faker.person.lastName()}`,
    place: 1,
    group: 'other',
    total: 600,
    highGame: 200,
    games: 3,
    ties: [],
    divisionName: 'Open',
    bonusPins: 0,
    ...overrides,
  }
}

/** Sweeper results with no one in them. Override what a test cares about. */
export function createSweeperResults(overrides: Partial<SweeperResults> = {}): SweeperResults {
  const { session, ...rest } = overrides
  return {
    session: {
      id: faker.string.uuid(),
      kind: 'sweeper',
      date: '2026-10-24T18:00:00',
      complete: false,
      games: 3,
      ...session,
    },
    cashRatio: 4,
    entries: 0,
    cashers: 0,
    cutScore: null,
    rows: [],
    ...rest,
  }
}

type DemoPlayer = [name: string, total: number, highGame: number, handicap?: number, games?: number]

/** Number the players 1 to N and put the first `advance` among the advancers and the next `cash` among the cashers. */
function demoRows(players: DemoPlayer[], advance: number, cash: number): SquadRow[] {
  const groupAt = (index: number): SquadRow['group'] => {
    if (index < advance) return 'advancer'
    return index < advance + cash ? 'casher' : 'other'
  }
  return players.map(([name, total, highGame, handicap = 0, games = 3], index) =>
    createSquadRow({
      name,
      place: index + 1,
      group: groupAt(index),
      total,
      highGame,
      handicap,
      games,
    }),
  )
}

/**
 * For the mock server: the results of a demo squad. A complete squad has two divisions, a tie at the
 * cut line, a bowler who did not finish, and a no-show. An open squad is part way through, so
 * bowlers have different game counts and the Games column shows (D-75, D-76).
 */
export function createDemoSquadResults(
  session: { id: string; date: string; complete: boolean },
  divisions: Division[],
): SquadResults {
  const [open, women] = divisions
  const base = { id: session.id, date: session.date, complete: session.complete, games: 3 }
  if (!session.complete) {
    return createSquadResults({
      session: { ...base, kind: 'squad' },
      finalsRatio: 8,
      cashRatio: 4,
      divisions: open
        ? [
            createDivisionResult({
              id: open.id,
              number: open.number,
              name: open.name,
              entries: 8,
              showGames: true,
              rows: demoRows(
                [
                  ['Dave Kowalski', 503, 258, 0, 2],
                  ['Marcus Reyes', 467, 241, 0, 2],
                  ['Tom Brandt', 458, 238, 0, 2],
                  ['Ray Costa', 457, 247, 0, 2],
                  ['Jim Albright', 456, 231, 0, 2],
                  ['Paul Nguyen', 232, 232, 0, 1],
                  ['Walt Pruitt', 218, 218, 0, 1],
                  ['Steve Marsh', 214, 214, 0, 1],
                ],
                1,
                1,
              ),
            }),
          ]
        : [],
    })
  }
  const bowlers: DemoPlayer[] = [
    ['Dave Kowalski', 735, 258],
    ['Marcus Reyes', 717, 250],
    ['Tom Brandt', 702, 244],
    ['Jim Albright', 692, 236],
    ['Ray Costa', 685, 247],
    ['Paul Nguyen', 677, 232],
    ['Steve Marsh', 674, 238],
    ['Frank DeLuca', 672, 238],
    ['Greg Olson', 667, 243],
    ['Walt Pruitt', 654, 224],
    ['Hank Dietrich', 640, 226],
    ['Lou Savage', 633, 224],
    ['Ed Brannigan', 608, 207],
    ['Carl Fenner', 589, 201],
  ]
  const seniors: DemoPlayer[] = [
    ['Linda Perrault', 648, 225, 24],
    ['Gail Whitmore', 648, 223, 30],
    ['Rita Alvarez', 610, 212, 12],
    ['Nancy Burke', 605, 208, 18],
    ['Joan Pelletier', 602, 210, 40],
    ['Carol Ng', 593, 205, 0],
    ['Sue Dunphy', 566, 194, 22],
    ['Barb Hollis', 550, 190, 35],
  ]
  const seniorRows = demoRows(seniors, 1, 1)
  const [winner, loser] = seniorRows
  if (winner) {
    winner.ties = [{ line: 'cut', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } }]
  }
  if (loser) {
    loser.ties = [{ line: 'cut', outcome: 'lost', decidedBy: { kind: 'game', rank: 1 } }]
  }
  const results: DivisionResult[] = []
  if (open) {
    results.push(
      createDivisionResult({
        id: open.id,
        number: open.number,
        name: open.name,
        entries: 16,
        rows: demoRows(bowlers, 2, 1),
        didNotFinish: [
          {
            registrationId: faker.string.uuid(),
            name: 'Bob Whitaker',
            total: 445,
            highGame: 230,
            games: 2,
            handicap: 0,
          },
        ],
        noShows: [{ registrationId: faker.string.uuid(), name: 'Mike Tran' }],
      }),
    )
  }
  if (women) {
    results.push(
      createDivisionResult({
        id: women.id,
        number: women.number,
        name: women.name,
        entries: 12,
        showHandicap: true,
        rows: seniorRows,
      }),
    )
  }
  return createSquadResults({
    session: { ...base, kind: 'squad' },
    finalsRatio: 8,
    cashRatio: 5,
    divisions: results.toSorted((a, b) => a.name.localeCompare(b.name)),
  })
}

/** For the mock server: the results of a demo sweeper, one list with each division's bonus pins. */
export function createDemoSweeperResults(session: {
  id: string
  date: string
  complete: boolean
  games: number
}): SweeperResults {
  const players: [string, string, number, number, number][] = [
    ['Dave Kowalski', 'Open', 0, 712, 256],
    ['Linda Perrault', 'Women', 10, 681, 229],
    ['Marcus Reyes', 'Open', 0, 679, 238],
    ['Gail Whitmore', 'Women', 10, 661, 220],
    ['Tom Brandt', 'Open', 0, 655, 233],
    ['Ray Costa', 'Open', 0, 640, 226],
  ]
  return createSweeperResults({
    session: {
      id: session.id,
      kind: 'sweeper',
      date: session.date,
      complete: session.complete,
      games: session.games,
    },
    cashRatio: 3,
    entries: players.length,
    cashers: 2,
    cutScore: 681,
    rows: players.map(([name, divisionName, bonusPins, total, highGame], index) =>
      createSweeperRow({
        name,
        divisionName,
        bonusPins,
        total,
        highGame,
        place: index + 1,
        group: index < 2 ? 'casher' : 'other',
        games: session.games,
      }),
    ),
  })
}

/** A bowler who took an at-large spot (RES-17). */
export function createAtLargeRow(overrides: Partial<AtLargeRow> = {}): AtLargeRow {
  return {
    registrationId: faker.string.uuid(),
    name: `${faker.person.firstName()} ${faker.person.lastName()}`,
    place: 1,
    squadDate: '2026-10-24T09:00:00',
    total: 1400,
    highGame: 240,
    previousCasher: false,
    ties: [],
    ...overrides,
  }
}

/** One division of at-large results. Override the rows and spots a test cares about. */
export function createAtLargeDivision(overrides: Partial<AtLargeDivision> = {}): AtLargeDivision {
  return {
    id: faker.string.uuid(),
    number: 1,
    name: 'Open',
    entries: 0,
    totalSpots: 0,
    squadAdvancers: 0,
    atLargeSpots: 0,
    rows: [],
    ...overrides,
  }
}

export function createAtLargeResults(overrides: Partial<AtLargeResults> = {}): AtLargeResults {
  return { complete: false, finalsRatio: 8, divisions: [], ...overrides }
}

/** A finalist (or, with `group: 'other'`, a bowler after the cut line) in a seeding (RES-20). */
export function createSeedingRow(overrides: Partial<SeedingRow> = {}): SeedingRow {
  return {
    registrationId: faker.string.uuid(),
    name: `${faker.person.firstName()} ${faker.person.lastName()}`,
    seed: 1,
    group: 'finalist',
    squadDate: '2026-10-24T09:00:00',
    total: 1400,
    highGame: 240,
    handicap: 0,
    previousCasher: false,
    ties: [],
    ...overrides,
  }
}

export function createSeedingDivision(overrides: Partial<SeedingDivision> = {}): SeedingDivision {
  return {
    id: faker.string.uuid(),
    number: 1,
    name: 'Open',
    entries: 0,
    finalists: 0,
    atLarge: 0,
    showHandicap: false,
    rows: [],
    ...overrides,
  }
}

export function createSeedingResults(overrides: Partial<SeedingResults> = {}): SeedingResults {
  return { complete: false, finalsRatio: 8, divisions: [], ...overrides }
}

/** A placed bowler of the super sweeper (RES-29a). Totals are one per sweeper column. */
export function createSuperSweeperRow(overrides: Partial<SuperSweeperRow> = {}): SuperSweeperRow {
  return {
    registrationId: faker.string.uuid(),
    name: `${faker.person.firstName()} ${faker.person.lastName()}`,
    place: 1,
    group: 'other',
    total: 1200,
    highGame: 220,
    games: 6,
    ties: [],
    divisionName: 'Open',
    sweeperTotals: [600, 600],
    flags: [],
    ...overrides,
  }
}

/** Super sweeper results with two complete sweepers and no one in them. */
export function createSuperSweeperResults(
  overrides: Partial<SuperSweeperResults> = {},
): SuperSweeperResults {
  return {
    complete: false,
    cashRatio: 4,
    entries: 0,
    cashers: 0,
    cutScore: null,
    sweepers: [
      { id: faker.string.uuid(), date: '2026-10-23T18:00:00', games: 3, complete: true },
      { id: faker.string.uuid(), date: '2026-10-24T18:00:00', games: 3, complete: true },
    ],
    rows: [],
    ...overrides,
  }
}

type DemoFinalist = [name: string, total: number, highGame: number, squad: number, cashed?: boolean]

const demoSquadDates = ['2026-10-23T09:00:00', '2026-10-23T13:00:00', '2026-10-24T09:00:00']

/** For the mock server: the at-large spots of a demo tournament, two divisions and a tie at the last spot. */
export function createDemoAtLarge(): AtLargeResults {
  const open: DemoFinalist[] = [
    ['Dave Kowalski', 1402, 248, 0, true],
    ['Marcus Reyes', 1398, 256, 1],
  ]
  return createAtLargeResults({
    complete: false,
    finalsRatio: 8,
    divisions: [
      createAtLargeDivision({
        number: 1,
        name: 'Open',
        entries: 80,
        totalSpots: 10,
        squadAdvancers: 8,
        atLargeSpots: 2,
        rows: open.map(([name, total, highGame, squad, cashed = false], index) =>
          createAtLargeRow({
            name,
            total,
            highGame,
            place: index + 1,
            squadDate: demoSquadDates[squad],
            previousCasher: cashed,
            ties:
              index === 1
                ? [{ line: 'cut', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } }]
                : [],
          }),
        ),
      }),
      createAtLargeDivision({
        number: 2,
        name: 'Women/Senior',
        entries: 32,
        totalSpots: 4,
        squadAdvancers: 4,
        atLargeSpots: 0,
      }),
    ],
  })
}

/** For the mock server: the seeding of a demo tournament, finalists then a cut line. */
export function createDemoSeeding(): SeedingResults {
  const players: DemoFinalist[] = [
    ['Dana Whitfield', 1512, 279, 2],
    ['Dave Kowalski', 1498, 255, 0, true],
    ['Marcus Reyes', 1498, 250, 1],
    ['Tom Brandt', 1210, 220, 0],
    ['Jim Albright', 1190, 215, 1],
  ]
  return createSeedingResults({
    finalsRatio: 8,
    divisions: [
      createSeedingDivision({
        number: 1,
        name: 'Open',
        entries: 80,
        finalists: 3,
        atLarge: 1,
        showHandicap: true,
        rows: players.map(([name, total, highGame, squad, cashed = false], index) =>
          createSeedingRow({
            name,
            total,
            highGame,
            seed: index + 1,
            group: index < 3 ? 'finalist' : 'other',
            squadDate: demoSquadDates[squad],
            handicap: index === 0 ? 12 : 0,
            previousCasher: cashed,
          }),
        ),
      }),
    ],
  })
}

/** For the mock server: the super sweeper over the demo sweepers, with a missed and an unfinished sweeper. */
export function createDemoSuperSweeper(
  sweepers: readonly { id: string; date: string; games: number; complete: boolean }[],
): SuperSweeperResults {
  const columns = sweepers.map(({ id, date, games, complete }) => ({ id, date, games, complete }))
  const [first, second] = columns
  const players: [string, string, (number | null)[], number, number, SuperSweeperRow['flags']][] = [
    ['Dana Whitfield', 'Women/Senior', [712, 698], 1410, 262, []],
    ['Dave Kowalski', 'Open', [690, 681], 1371, 248, []],
    [
      'Sam Ortiz',
      'Open',
      [605, 0],
      605,
      220,
      second ? [{ kind: 'missed', sweeperId: second.id, gamesBowled: 0 }] : [],
    ],
    [
      'Lee Park',
      'Women/Senior',
      [390, 380],
      770,
      231,
      first ? [{ kind: 'unfinished', sweeperId: first.id, gamesBowled: 2 }] : [],
    ],
  ]
  return createSuperSweeperResults({
    complete: false,
    cashRatio: 2,
    entries: players.length,
    cashers: 2,
    cutScore: 1371,
    sweepers: columns,
    rows: players.map(([name, divisionName, sweeperTotals, total, highGame, flags], index) =>
      createSuperSweeperRow({
        name,
        divisionName,
        sweeperTotals: sweeperTotals.slice(0, columns.length),
        total,
        highGame,
        flags,
        place: index + 1,
        group: index < 2 ? 'casher' : 'other',
        games: columns.reduce((sum, column) => sum + column.games, 0),
      }),
    ),
  })
}
