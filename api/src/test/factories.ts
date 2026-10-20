import { faker } from '@faker-js/faker'
import type { Tournament } from '../features/tournaments/types.ts'

export function createTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: faker.string.uuid(),
    name: `${faker.location.city()} Open`,
    date: faker.date.future().toISOString().slice(0, 10),
    entrants: faker.number.int({ min: 8, max: 128 }),
    ...overrides,
  }
}

export function createTournaments(count = 5): Tournament[] {
  return Array.from({ length: count }, () => createTournament())
}
