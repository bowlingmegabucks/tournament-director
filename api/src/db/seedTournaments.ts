import type { PrismaClient } from '../shared/database.ts'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const TOURNAMENT_DAYS = 3

// Fixed ids, so running the seed twice updates these rows and adds none.
const samples = [
  { id: '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01', center: 'Spare Time Lanes, Worcester MA', fee: 50 },
  { id: '2b9d6f3e-8a14-4e77-b0c2-5e1a9d7c3f02', center: 'Spare Time Lanes, Worcester MA', fee: 50 },
  { id: 'c4f8a1d7-6e90-4b3a-8d25-9a0e7b1c5d03', center: 'Lucky Strike Bowl, Nashua NH', fee: 45 },
  { id: '91e3b5c0-2d68-47fa-a1b4-3c7d8e9f6a04', center: 'Lucky Strike Bowl, Nashua NH', fee: 45 },
]

function midnight(time: number): Date {
  return new Date(Math.floor(time / MS_PER_DAY) * MS_PER_DAY)
}

/**
 * Put four sample tournaments in the local database: the newest starts in two days, so it is
 * upcoming; three earlier ones, a year apart, are past. Safe to run again. Local use only.
 */
export async function seedTournaments(client: PrismaClient, now = new Date()): Promise<number> {
  const newestStart = midnight(now.getTime()).getTime() + 2 * MS_PER_DAY

  for (const [index, { id, center, fee }] of samples.entries()) {
    const start = midnight(newestStart - index * 365 * MS_PER_DAY)
    const end = new Date(start.getTime() + (TOURNAMENT_DAYS - 1) * MS_PER_DAY)
    const name = `${start.getUTCFullYear()} Northeast MegaBuck$ Tournament`
    // Raw SQL: the Prisma model holds only the columns the app reads, and the table needs the rest.
    await client.$executeRaw`
      INSERT INTO Tournaments
        (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
      VALUES (${id}, ${name}, ${start}, ${end}, ${fee}, 6, 7.0, 5.0, ${center}, 0)
      ON DUPLICATE KEY UPDATE
        Name = VALUES(Name), Start = VALUES(Start), End = VALUES(End),
        EntryFee = VALUES(EntryFee), BowlingCenter = VALUES(BowlingCenter)`
  }
  return samples.length
}
