import { faker } from '@faker-js/faker'
import type { Division } from '../features/divisions/types'
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
