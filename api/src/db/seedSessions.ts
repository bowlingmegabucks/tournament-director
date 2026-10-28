import type { PrismaClient } from '../shared/database.ts'
import { divisionId } from './seedDivisions.ts'
import { samples as sampleTournaments } from './seedTournaments.ts'

const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

// `day` and `hour` count from the tournament's first midnight. A NULL fee or ratio means the squad
// uses the tournament's.
const squads = [
  {
    n: 1,
    day: 0,
    hour: 9,
    lane: 1,
    lanes: 24,
    perPair: 4,
    complete: 1,
    fee: null,
    finals: null,
    cash: null,
  },
  {
    n: 2,
    day: 0,
    hour: 13,
    lane: 1,
    lanes: 24,
    perPair: 4,
    complete: 0,
    fee: 60,
    finals: 8,
    cash: null,
  },
  {
    n: 3,
    day: 1,
    hour: 9,
    lane: 11,
    lanes: 10,
    perPair: 5,
    complete: 0,
    fee: null,
    finals: null,
    cash: 4.5,
  },
]
// Pins are keyed by division number (see `seedDivisions`). A missing number has no row; NULL and 0
// are stored as they are, so the list can show that neither appears (D-45).
const sweepers = [
  { n: 1, day: 0, hour: 18, complete: 0, fee: 25, games: 3, cash: 4, pins: { 1: 10, 2: 6 } },
  {
    n: 2,
    day: 1,
    hour: 17,
    complete: 1,
    fee: 30,
    games: 4,
    cash: 5,
    pins: { 1: null, 2: 6, 3: 0 },
  },
]

// A fixed id per tournament and number, so running the seed twice updates these rows and adds none.
// `a` is a squad and `b` a sweeper; both are hex, so the id stays a valid UUID.
export function sessionId(tournamentId: string, kind: 'a' | 'b', n: number): string {
  return `${tournamentId.slice(0, -4)}${kind}00${n}`
}

/**
 * Put three sample squads and two sample sweepers in each sample tournament from
 * `seedTournaments`, with bonus pins on the divisions from `seedDivisions`. Both must run first
 * (these rows point to them). Safe to run again. Local use only.
 */
export async function seedSessions(client: PrismaClient): Promise<number> {
  const tournaments = await client.tournament.findMany({
    where: { id: { in: sampleTournaments.map(({ id }) => id) } },
    select: { id: true, start: true },
  })

  await Promise.all(
    tournaments.flatMap(({ id, start }) => {
      const at = (day: number, hour: number) =>
        new Date(start.getTime() + day * MS_PER_DAY + hour * MS_PER_HOUR)

      const squadWrites = squads.map((squad) => {
        // Raw SQL, like the other seeds: it writes the legacy columns directly.
        return client.$executeRaw`
          INSERT INTO Squads
            (Id, TournamentId, SquadType, Date, CashRatio, MaxPerPair, StartingLane, NumberOfLanes,
             Complete, FinalsRatio, SquadEntryFee)
          VALUES (${sessionId(id, 'a', squad.n)}, ${id}, 0, ${at(squad.day, squad.hour)}, ${squad.cash},
                  ${squad.perPair}, ${squad.lane}, ${squad.lanes}, ${squad.complete}, ${squad.finals},
                  ${squad.fee})
          ON DUPLICATE KEY UPDATE
            Date = VALUES(Date), CashRatio = VALUES(CashRatio), MaxPerPair = VALUES(MaxPerPair),
            StartingLane = VALUES(StartingLane), NumberOfLanes = VALUES(NumberOfLanes),
            Complete = VALUES(Complete), FinalsRatio = VALUES(FinalsRatio),
            SquadEntryFee = VALUES(SquadEntryFee)`
      })

      const sweeperWrites = sweepers.map(async (sweeper) => {
        const sweeperId = sessionId(id, 'b', sweeper.n)
        await client.$executeRaw`
          INSERT INTO Squads
            (Id, TournamentId, SquadType, Date, CashRatio, MaxPerPair, StartingLane, NumberOfLanes,
             Complete, SweeperEntryFee, Games)
          VALUES (${sweeperId}, ${id}, 1, ${at(sweeper.day, sweeper.hour)}, ${sweeper.cash}, 4, 1,
                  12, ${sweeper.complete}, ${sweeper.fee}, ${sweeper.games})
          ON DUPLICATE KEY UPDATE
            Date = VALUES(Date), CashRatio = VALUES(CashRatio), Complete = VALUES(Complete),
            SweeperEntryFee = VALUES(SweeperEntryFee), Games = VALUES(Games)`
        // The pins point at the sweeper, so it goes in first.
        await Promise.all(
          Object.entries(sweeper.pins).map(([number, pins]) => {
            return client.$executeRaw`
              INSERT INTO SweeperDivision (SweeperId, DivisionId, BonusPinsPerGame)
              VALUES (${sweeperId}, ${divisionId(id, Number(number))}, ${pins})
              ON DUPLICATE KEY UPDATE BonusPinsPerGame = VALUES(BonusPinsPerGame)`
          }),
        )
      })

      return [...squadWrites, ...sweeperWrites]
    }),
  )
  return tournaments.length * (squads.length + sweepers.length)
}
