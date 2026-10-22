import { faker } from '@faker-js/faker'
import type { Config } from '../config.ts'
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

/** A config with no CORS origins and no telemetry destination. The database URL points nowhere real. */
export function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    databaseUrl: 'mariadb://user:password@localhost:3306/test',
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
