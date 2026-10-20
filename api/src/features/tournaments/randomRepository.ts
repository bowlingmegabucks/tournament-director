import { randomInt, randomUUID } from 'node:crypto'
import type { TournamentRepository } from './repository.ts'
import type { Tournament } from './types.ts'

// Stryker disable StringLiteral: name lists are data, not logic.
const cities = ['Boston', 'Denver', 'Austin', 'Portland', 'Chicago', 'Tampa', 'Reno', 'Omaha']
const kinds = ['Open', 'Classic', 'Championship', 'Invitational', 'Masters']

// Stryker restore StringLiteral

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface RandomOptions {
  /** Integer in [min, max). Swap in a fake to make a test predictable. */
  randomInt?: (min: number, max: number) => number
  now?: () => Date
}

/**
 * Demo data until a database exists: every call returns 3 to 7 new tournaments,
 * so a refresh in the browser shows the data comes from the API.
 */
export function createRandomTournamentRepository({
  randomInt: pickInt = randomInt,
  now = () => new Date(),
}: RandomOptions = {}): TournamentRepository {
  const pick = <T>(items: T[]): T => items[pickInt(0, items.length)] as T

  return {
    list: () => {
      const count = pickInt(3, 8)
      const tournaments: Tournament[] = Array.from({ length: count }, () => ({
        id: randomUUID(),
        name: `${pick(cities)} ${pick(kinds)}`,
        date: new Date(now().getTime() + pickInt(1, 366) * MS_PER_DAY).toISOString().slice(0, 10),
        entrants: pickInt(8, 129),
      }))
      return Promise.resolve(tournaments.sort((a, b) => a.date.localeCompare(b.date)))
    },
  }
}
