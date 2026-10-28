import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createTournament } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaRegistrationRepository } from './prismaRepository.ts'

describe('Prisma registration repository', () => {
  let client: PrismaClient

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(client)
  })

  async function insertTournament(): Promise<string> {
    const { id, name } = createTournament()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, ?, '2026-10-23', '2026-10-25', 50, 6, 7.0, 5.0, 'Lanes', 0)`,
      id,
      name,
    )
    return id
  }

  async function insertDivision(tournamentId: string, name = 'Open'): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Divisions (Id, Name, Number, TournamentId) VALUES (?, ?, 1, ?)`,
      id,
      name,
      tournamentId,
    )
    return id
  }

  async function insertSession(tournamentId: string, type = 0): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Squads
         (Id, TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, Complete)
       VALUES (?, ?, ?, '2026-10-24 09:00:00', 4, 1, 12, 0)`,
      id,
      tournamentId,
      type,
    )
    return id
  }

  async function insertBowler(
    fields: {
      id?: string
      first?: string
      last?: string
      suffix?: string
      usbc?: string
      ssn?: string
    } = {},
  ): Promise<string> {
    const id = fields.id ?? crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Bowlers
         (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
          ZipCode, EmailAddress, PhoneNumber, USBCId, DateOfBirth, Gender, SocialSecurityNumber)
       VALUES (?, ?, 'Q', ?, ?, '1 Main St', 'Boston', 'MA', '02101', 'x@example.com',
               '6175550100', ?, '1980-01-01', 0, ?)`,
      id,
      fields.first ?? 'Ray',
      fields.last ?? 'Baptiste',
      fields.suffix ?? '',
      fields.usbc ?? '1190-55820',
      fields.ssn ?? 'c2VjcmV0LXNzbg==',
    )
    return id
  }

  async function insertRegistration(
    bowlerId: string,
    divisionId: string,
    fields: { id?: string; superSweeper?: number; sessions?: string[] } = {},
  ): Promise<string> {
    const id = fields.id ?? crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Registrations (Id, BowlerId, DivisionId, Average, SuperSweeper)
       VALUES (?, ?, ?, 190, ?)`,
      id,
      bowlerId,
      divisionId,
      fields.superSweeper ?? 0,
    )
    for (const sessionId of fields.sessions ?? []) {
      await client.$executeRawUnsafe(
        `INSERT INTO SquadRegistration (RegistrationId, SquadId, LaneAssignment) VALUES (?, ?, '')`,
        id,
        sessionId,
      )
    }
    return id
  }

  function setup() {
    const captured = createCapturedLogger()
    return { ...captured, repository: createPrismaRegistrationRepository(client, captured.logger) }
  }

  it('reads the bowler, division, flags, and squad and sweeper ids (REG-23, REG-24)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId, 'Women / Senior')
    const squadId = await insertSession(tournamentId, 0)
    const sweeperId = await insertSession(tournamentId, 1)
    const bowlerId = await insertBowler({ suffix: 'Jr' })
    const id = await insertRegistration(bowlerId, divisionId, {
      superSweeper: 1,
      sessions: [squadId, sweeperId],
    })
    const { repository } = setup()

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([
      {
        id,
        bowler: {
          id: bowlerId,
          name: 'Ray Baptiste, Jr',
          firstName: 'Ray',
          lastName: 'Baptiste',
          usbcId: '1190-55820',
        },
        divisionId,
        divisionName: 'Women / Senior',
        superSweeper: true,
        squadIds: [squadId],
        sweeperIds: [sweeperId],
      },
    ])
  })

  it('reads only this tournament, through the division (REG-26)', async () => {
    const mine = await insertTournament()
    const other = await insertTournament()
    await insertRegistration(await insertBowler(), await insertDivision(mine))
    await insertRegistration(await insertBowler({ last: 'Other' }), await insertDivision(other))
    const { repository } = setup()

    const listed = await repository.listByTournament(mine)

    expect(listed.map((r) => r.bowler.lastName)).toEqual(['Baptiste'])
  })

  it('returns an empty list when nobody is registered (REG-26)', async () => {
    const tournamentId = await insertTournament()
    const { repository } = setup()

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([])
  })

  it('sorts by last name, then first name, then id (REG-23, D-51)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    await insertRegistration(await insertBowler({ first: 'Zed', last: 'Adams' }), divisionId)
    await insertRegistration(await insertBowler({ first: 'amy', last: 'young' }), divisionId)
    await insertRegistration(await insertBowler({ first: 'Bob', last: 'Adams' }), divisionId)
    await insertRegistration(await insertBowler({ first: 'Joe', last: 'Fontaine' }), divisionId, {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    })
    await insertRegistration(await insertBowler({ first: 'Joe', last: 'Fontaine' }), divisionId, {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })
    const { repository } = setup()

    const listed = await repository.listByTournament(tournamentId)

    expect(listed.map((r) => r.bowler.name)).toEqual([
      'Bob Adams',
      'Zed Adams',
      'Joe Fontaine',
      'Joe Fontaine',
      'amy young',
    ])
    expect(listed.slice(2, 4).map((r) => r.id)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ])
  })

  it('ignores a squad of another tournament and a session of an unknown type (D-51)', async () => {
    const tournamentId = await insertTournament()
    const otherId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const mine = await insertSession(tournamentId, 0)
    const elsewhere = await insertSession(otherId, 0)
    const odd = await insertSession(tournamentId, 2)
    await insertRegistration(await insertBowler(), divisionId, {
      sessions: [mine, elsewhere, odd],
    })
    const { repository } = setup()

    const [registration] = await repository.listByTournament(tournamentId)

    expect(registration?.squadIds).toEqual([mine])
    expect(registration?.sweeperIds).toEqual([])
  })

  it('reads an empty USBC ID as an empty string (REG-23)', async () => {
    const tournamentId = await insertTournament()
    await insertRegistration(await insertBowler({ usbc: '' }), await insertDivision(tournamentId))
    const { repository } = setup()

    const [registration] = await repository.listByTournament(tournamentId)

    expect(registration?.bowler.usbcId).toBe('')
  })

  it('shows both rows for a bowler with two registrations and logs a warning (REG-27, D-48)', async () => {
    const tournamentId = await insertTournament()
    const bowlerId = await insertBowler()
    const first = await insertRegistration(bowlerId, await insertDivision(tournamentId, 'Open'))
    const second = await insertRegistration(bowlerId, await insertDivision(tournamentId, 'Senior'))
    const { repository, records } = setup()

    const listed = await repository.listByTournament(tournamentId)

    expect(listed).toHaveLength(2)
    const warning = records().find(
      (record) => record.msg === 'A bowler has more than one registration in this tournament',
    )
    expect(warning).toMatchObject({ level: 40, bowlerId, tournamentId })
    expect((warning?.registrationIds as string[]).sort()).toEqual([first, second].sort())
  })

  it('does not warn when each bowler has one registration (REG-27)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    await insertRegistration(await insertBowler(), divisionId)
    await insertRegistration(await insertBowler({ last: 'Other' }), divisionId)
    const { repository, records } = setup()

    await repository.listByTournament(tournamentId)

    expect(records()).toEqual([])
  })

  it('skips a bowler with no name and logs it (REG-26, D-51)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const good = await insertRegistration(await insertBowler(), divisionId)
    const bad = await insertRegistration(await insertBowler({ first: '' }), divisionId)
    const { repository, records } = setup()

    const listed = await repository.listByTournament(tournamentId)

    expect(listed.map((r) => r.id)).toEqual([good])
    expect(records()).toEqual([
      expect.objectContaining({
        level: 40,
        msg: 'Skipped a stored registration that breaks the read shape',
        registrationId: bad,
        tournamentId,
      }),
    ])
  })

  it('never returns the SSN or other personal fields (BWL-17)', async () => {
    const tournamentId = await insertTournament()
    await insertRegistration(
      await insertBowler({ ssn: 'TOP-SECRET-CIPHERTEXT' }),
      await insertDivision(tournamentId),
    )
    const { repository } = setup()

    const listed = await repository.listByTournament(tournamentId)

    const text = JSON.stringify(listed)
    expect(text).not.toContain('TOP-SECRET-CIPHERTEXT')
    expect(text).not.toMatch(/example\.com|6175550100|Main St|1980/)
  })
})
