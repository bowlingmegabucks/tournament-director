import { faker } from '@faker-js/faker'
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
