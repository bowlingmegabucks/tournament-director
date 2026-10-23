import type { PrismaClient } from '../shared/database.ts'
import { samples as sampleTournaments } from './seedTournaments.ts'

// Percentages are fractions here, as legacy stores them.
const samples = [
  { number: 1, name: 'Open', gender: null, percentage: 0.9, base: 220, cap: null },
  { number: 2, name: 'Women', gender: 1, percentage: 0.9, base: 220, cap: 40 },
  { number: 3, name: 'Scratch', gender: null, percentage: null, base: null, cap: null },
]

// A fixed id per tournament and number, so running the seed twice updates these rows and adds none.
// Only the last four digits change, so the id stays a valid UUID.
function divisionId(tournamentId: string, number: number): string {
  return `${tournamentId.slice(0, -4)}d00${number}`
}

/**
 * Put three sample divisions (Open, Women, Scratch) in each sample tournament from
 * `seedTournaments`, which must run first (the divisions point to them). Safe to run again.
 * Local use only.
 */
export async function seedDivisions(client: PrismaClient): Promise<number> {
  const rows = sampleTournaments.flatMap(({ id }) =>
    samples.map((sample) => ({ ...sample, tournamentId: id })),
  )

  await Promise.all(
    rows.map(({ tournamentId, number, name, gender, percentage, base, cap }) => {
      // Raw SQL, like the tournament seed: it writes the legacy columns directly.
      return client.$executeRaw`
        INSERT INTO Divisions
          (Id, Name, Number, TournamentId, HandicapPercentage, HandicapBase,
           MaximumHandicapPerGame, Gender)
        VALUES (${divisionId(tournamentId, number)}, ${name}, ${number}, ${tournamentId},
                ${percentage}, ${base}, ${cap}, ${gender})
        ON DUPLICATE KEY UPDATE
          Name = VALUES(Name), Number = VALUES(Number), HandicapPercentage = VALUES(HandicapPercentage),
          HandicapBase = VALUES(HandicapBase), MaximumHandicapPerGame = VALUES(MaximumHandicapPerGame),
          Gender = VALUES(Gender)`
    }),
  )
  return rows.length
}
