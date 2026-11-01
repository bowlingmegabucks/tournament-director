import { faker } from '@faker-js/faker'
import type { Config } from '../config.ts'
import type { Division } from '../features/divisions/types.ts'
import type { LaneEntry } from '../features/lanes/types.ts'
import {
  toResultEntry,
  type ResultEntry,
  type ResultEntryInput,
} from '../features/results/entries.ts'
import type { Registration } from '../features/registrations/types.ts'
import type { Squad } from '../features/squads/types.ts'
import type { Sweeper } from '../features/sweepers/types.ts'
import type { Tournament } from '../features/tournaments/types.ts'

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

export function createTournaments(count = 5): Tournament[] {
  return Array.from({ length: count }, () => createTournament())
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
    superSweeper: false,
    squadIds: [],
    sweeperIds: [],
    ...overrides,
  }
}

export function createLaneEntry(overrides: Partial<LaneEntry> = {}): LaneEntry {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  return {
    registrationId: faker.string.uuid(),
    bowlerId: faker.string.uuid(),
    name: `${firstName} ${lastName}`,
    firstName,
    lastName,
    divisionId: faker.string.uuid(),
    average: 200,
    superSweeper: false,
    position: '',
    ...overrides,
  }
}

/** A result entry with three games of 200 and no pins. Override the games, pins, or names a test cares about. */
export function createResultEntry(overrides: Partial<ResultEntryInput> = {}): ResultEntry {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  return toResultEntry({
    registrationId: faker.string.uuid(),
    bowlerId: faker.string.uuid(),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    divisionId: faker.string.uuid(),
    divisionName: 'Open',
    games: [200, 200, 200],
    pins: 0,
    ...overrides,
  })
}

/** A config with no CORS origins and no telemetry destination. The database URL points nowhere real. */
/** The key `createConfig` sets. Send it in `x-api-key` to call as the API key. */
export const testApiKey = 'test-api-key-0123456789-0123456789'

export function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    databaseUrl: 'mariadb://user:password@localhost:3306/test',
    apiKey: testApiKey,
    logLevel: 'silent',
    // High enough that no test hits it by accident. Tests of the limit set their own.
    rateLimit: { max: 1000, windowSeconds: 60 },
    trustProxy: 0,
    corsOrigins: [],
    telemetry: {
      serviceName: 'test-api',
      serviceVersion: '0.0.0',
      environment: 'test',
      otlpEndpoint: undefined,
      appInsightsConnectionString: undefined,
    },
    ...overrides,
  }
}
