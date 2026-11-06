import type { PrismaClient } from '../shared/database.ts'

/**
 * Raw inserts for the tests of rules that count rows across tables (the edit rules, D-128). Raw SQL
 * keeps them independent of the Prisma models they check.
 */
export interface LegacyRows {
  tournament(overrides?: { completed?: boolean; start?: string; end?: string }): Promise<string>
  division(tournamentId: string, overrides?: { name?: string; number?: number }): Promise<string>
  /** `at` is local time as legacy stores it, like `2026-10-24 09:00:00`. */
  session(tournamentId: string, kind: 'squad' | 'sweeper', at: string): Promise<string>
  registration(divisionId: string): Promise<{ registrationId: string; bowlerId: string }>
  score(bowlerId: string, sessionId: string, game?: number): Promise<void>
  /** A payment on a registration. `code` is `<ProcessingSystem>_<code>`, such as `Manual_abc` (PAY-03). */
  payment(registrationId: string, code: string, amount: number): Promise<void>
  /** Bonus pins per game for one division in one sweeper (SQD-13). `null` is stored as NULL. */
  sweeperPins(sweeperId: string, divisionId: string, pins: number | null): Promise<void>
  /** Put a registration into a squad or sweeper (REG-24). */
  squadEntry(registrationId: string, sessionId: string): Promise<void>
}

export function legacyRows(client: PrismaClient): LegacyRows {
  const run = (sql: string, ...values: unknown[]) => client.$executeRawUnsafe(sql, ...values)
  return {
    async tournament({ completed = false, start = '2026-10-23', end = '2026-10-25' } = {}) {
      const id = crypto.randomUUID()
      await run(
        `INSERT INTO Tournaments
           (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, SuperSweperCashRatio,
            BowlingCenter, Completed)
         VALUES (?, ?, ?, ?, 50, 6, 7.0, 5.0, 4.0, 'Lanes', ?)`,
        id,
        `Open ${id.slice(0, 8)}`,
        start,
        end,
        completed ? 1 : 0,
      )
      return id
    },
    async division(tournamentId, { name = 'Open', number = 1 } = {}) {
      const id = crypto.randomUUID()
      await run(
        `INSERT INTO Divisions (Id, Name, Number, TournamentId) VALUES (?, ?, ?, ?)`,
        id,
        name,
        number,
        tournamentId,
      )
      return id
    },
    async session(tournamentId, kind, at) {
      const id = crypto.randomUUID()
      await run(
        `INSERT INTO Squads
           (Id, TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, Complete)
         VALUES (?, ?, ?, ?, 4, 1, 12, 0)`,
        id,
        tournamentId,
        kind === 'sweeper' ? 1 : 0,
        at,
      )
      return id
    },
    async registration(divisionId) {
      const bowlerId = crypto.randomUUID()
      await run(
        `INSERT INTO Bowlers
           (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
            ZipCode, EmailAddress, PhoneNumber, USBCId, DateOfBirth, Gender, SocialSecurityNumber)
         VALUES (?, 'Ray', 'Q', 'Baptiste', '', '1 Main St', 'Boston', 'MA', '02101', 'x@example.com',
                 '6175550100', '1190-55820', '1980-01-01', 0, 'c2VjcmV0LXNzbg==')`,
        bowlerId,
      )
      const registrationId = crypto.randomUUID()
      await run(
        `INSERT INTO Registrations (Id, BowlerId, DivisionId, Average, SuperSweeper) VALUES (?, ?, ?, 180, 0)`,
        registrationId,
        bowlerId,
        divisionId,
      )
      return { registrationId, bowlerId }
    },
    async payment(registrationId, code, amount) {
      await run(
        `INSERT INTO Payments (Id, CreatedAtUtc, RegistrationId, ConfirmationCode, Amount)
         VALUES (?, UTC_TIMESTAMP(6), ?, ?, ?)`,
        crypto.randomUUID(),
        registrationId,
        code,
        amount,
      )
    },
    async squadEntry(registrationId, sessionId) {
      await run(
        'INSERT INTO SquadRegistration (RegistrationId, SquadId, LaneAssignment) VALUES (?, ?, ?)',
        registrationId,
        sessionId,
        '',
      )
    },
    async sweeperPins(sweeperId, divisionId, pins) {
      await run(
        'INSERT INTO SweeperDivision (SweeperId, DivisionId, BonusPinsPerGame) VALUES (?, ?, ?)',
        sweeperId,
        divisionId,
        pins,
      )
    },
    async score(bowlerId, sessionId, game = 1) {
      await run(
        'INSERT INTO SquadScores (BowlerId, SquadId, Game, Score) VALUES (?, ?, ?, 200)',
        bowlerId,
        sessionId,
        game,
      )
    },
  }
}
