import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaBowlerRepository, escapeLike } from './prismaRepository.ts'
import { searchLimit } from './types.ts'

describe('Prisma bowler repository (BWL-14, BWL-17, D-157)', () => {
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

  const repository = () => createPrismaBowlerRepository(client, createCapturedLogger().logger)

  async function insertBowler(
    fields: {
      first?: string
      last?: string
      email?: string
      usbcId?: string
      suffix?: string
    } = {},
  ): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Bowlers
         (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
          ZipCode, EmailAddress, PhoneNumber, USBCId, DateOfBirth, Gender, SocialSecurityNumber)
       VALUES (?, ?, '', ?, ?, '1 Main St', 'Worcester', 'MA', '01604', ?, '', ?, '1980-01-01', 1, 'c2VjcmV0')`,
      id,
      fields.first ?? 'Maria',
      fields.last ?? 'Gonzalez',
      fields.suffix ?? '',
      fields.email ?? 'maria@example.com',
      fields.usbcId ?? '1234-56789',
    )
    return id
  }

  async function register(bowlerId: string, divisionName: string): Promise<string> {
    const tournamentId = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, 'Open', '2026-10-23', '2026-10-25', 50, 6, 7.0, 5.0, 'Lanes', 0)`,
      tournamentId,
    )
    const divisionId = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Divisions (Id, Name, Number, TournamentId) VALUES (?, ?, 1, ?)`,
      divisionId,
      divisionName,
      tournamentId,
    )
    await client.$executeRawUnsafe(
      `INSERT INTO Registrations (Id, BowlerId, DivisionId, Average, SuperSweeper)
       VALUES (?, ?, ?, 190, 0)`,
      crypto.randomUUID(),
      bowlerId,
      divisionId,
    )
    return tournamentId
  }

  it('matches names by prefix, ignoring case, and returns the contract fields only', async () => {
    const id = await insertBowler({ suffix: 'Jr' })
    await insertBowler({ first: 'Paul', last: 'Gonzalez', email: 'p@example.com', usbcId: '' })

    const { bowlers, more } = await repository().search({ lastName: 'GON', firstName: 'mar' })

    expect(more).toBe(false)
    expect(bowlers).toEqual([
      {
        id,
        name: 'Maria Gonzalez, Jr',
        firstName: 'Maria',
        lastName: 'Gonzalez',
        usbcId: '1234-56789',
        city: 'Worcester',
        state: 'MA',
        registered: null,
      },
    ])
    expect(JSON.stringify(bowlers)).not.toMatch(/c2VjcmV0|social/i)
  })

  it('treats % and _ as plain characters in a prefix', async () => {
    await insertBowler()

    expect((await repository().search({ lastName: '%' })).bowlers).toHaveLength(0)
    expect((await repository().search({ lastName: 'Gonzale_' })).bowlers).toHaveLength(0)
  })

  it('escapes the characters LIKE treats as wildcards', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d')
    expect(escapeLike('plain')).toBe('plain')
  })

  it('finds a bowler whose name holds a % or a _ by typing it', async () => {
    const id = await insertBowler({ last: 'O_Neil%' })

    expect((await repository().search({ lastName: 'O_Neil%' })).bowlers.map((b) => b.id)).toEqual([
      id,
    ])
    expect((await repository().search({ lastName: 'O_N' })).bowlers.map((b) => b.id)).toEqual([id])
    expect((await repository().search({ lastName: 'OxN' })).bowlers).toHaveLength(0)
  })

  it('matches email and USBC ID whole, and combines filters with AND', async () => {
    const id = await insertBowler()
    await insertBowler({ first: 'Mario', email: 'mario@example.com', usbcId: '1234-567890' })

    expect(
      (await repository().search({ email: 'MARIA@example.com' })).bowlers.map((b) => b.id),
    ).toEqual([id])
    expect((await repository().search({ usbcId: '1234-56789' })).bowlers.map((b) => b.id)).toEqual([
      id,
    ])
    expect((await repository().search({ usbcId: '1234' })).bowlers).toHaveLength(0)
    expect(
      (await repository().search({ lastName: 'Gon', usbcId: '1234-567890' })).bowlers.map(
        (b) => b.firstName,
      ),
    ).toEqual(['Mario'])
  })

  it('sorts by last name, first name, then id', async () => {
    await insertBowler({ first: 'Zed', last: 'Abel', usbcId: '1-1' })
    await insertBowler({ first: 'Amy', last: 'Zane', usbcId: '1-2' })
    await insertBowler({ first: 'Amy', last: 'Abel', usbcId: '1-3' })

    const { bowlers } = await repository().search({
      lastName: '' + 'A',
      email: 'maria@example.com',
    })
    const all = await repository().search({ email: 'maria@example.com' })

    expect(bowlers.map((b) => `${b.firstName} ${b.lastName}`)).toEqual(['Amy Abel', 'Zed Abel'])
    expect(all.bowlers.map((b) => b.lastName)).toEqual(['Abel', 'Abel', 'Zane'])
  })

  it('cuts the list at the limit and says there is more', async () => {
    for (let index = 0; index < searchLimit + 1; index += 1) {
      await insertBowler({
        first: `A${String(index).padStart(2, '0')}`,
        usbcId: `1-${String(index)}`,
      })
    }

    const { bowlers, more } = await repository().search({ lastName: 'Gon' })

    expect(bowlers).toHaveLength(searchLimit)
    expect(more).toBe(true)
    expect(bowlers[0]?.firstName).toBe('A00')
  })

  it('marks a bowler registered in the tournament asked about, with the division name (REG-01)', async () => {
    const id = await insertBowler()
    const other = await insertBowler({ first: 'Mario', usbcId: '1-9' })
    const tournamentId = await register(id, 'Handicap')

    const asked = await repository().search({ lastName: 'Gon', tournamentId })
    const notAsked = await repository().search({ lastName: 'Gon' })
    const elsewhere = await repository().search({
      lastName: 'Gon',
      tournamentId: crypto.randomUUID(),
    })

    expect(asked.bowlers.map((b) => [b.id, b.registered])).toEqual([
      [id, { divisionName: 'Handicap' }],
      [other, null],
    ])
    expect(notAsked.bowlers.every((b) => b.registered === null)).toBe(true)
    expect(elsewhere.bowlers.every((b) => b.registered === null)).toBe(true)
  })
})
