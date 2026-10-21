import { createInMemoryTournamentRepository, type TournamentRepository } from './repository.ts'
import type { Tournament } from './types.ts'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const TOURNAMENT_DAYS = 3

function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

// Stryker disable StringLiteral: ids, names, and centers are demo data, not logic.
const demo = [
  { id: '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01', center: 'Spare Time Lanes, Worcester MA', fee: 50 },
  { id: '2b9d6f3e-8a14-4e77-b0c2-5e1a9d7c3f02', center: 'Spare Time Lanes, Worcester MA', fee: 50 },
  { id: 'c4f8a1d7-6e90-4b3a-8d25-9a0e7b1c5d03', center: 'Lucky Strike Bowl, Nashua NH', fee: 45 },
  { id: '91e3b5c0-2d68-47fa-a1b4-3c7d8e9f6a04', center: 'Lucky Strike Bowl, Nashua NH', fee: 45 },
]
// Stryker restore StringLiteral

export interface DemoOptions {
  now?: () => Date
}

/**
 * Demo data until a database exists (D-26). The newest tournament starts in two days, so it is
 * upcoming whenever the API starts. Three earlier ones, a year apart, are past.
 */
export function createDemoTournamentRepository({
  now = () => new Date(),
}: DemoOptions = {}): TournamentRepository {
  const today = Date.parse(isoDate(now().getTime()))
  const newestStart = today + 2 * MS_PER_DAY

  const tournaments: Tournament[] = demo.map(({ id, center, fee }, index) => {
    const start = newestStart - index * 365 * MS_PER_DAY
    return {
      id,
      name: `${new Date(start).getUTCFullYear()} Northeast MegaBuck$ Tournament`,
      startDate: isoDate(start),
      endDate: isoDate(start + (TOURNAMENT_DAYS - 1) * MS_PER_DAY),
      entryFee: fee,
      bowlingCenter: center,
    }
  })

  return createInMemoryTournamentRepository(tournaments)
}
