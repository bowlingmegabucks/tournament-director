import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaDivisionRepository } from '../divisions/prismaRepository.ts'
import { createPrismaSweeperRepository } from '../sweepers/prismaRepository.ts'
import { createPrismaTournamentRepository } from '../tournaments/prismaRepository.ts'
import { deskRegister } from './deskRegister.ts'
import { editRegistration, type EditResult } from './editRegister.ts'
import { parseEditRequest } from './editRequest.ts'
import { parseDeskRequest } from './deskRequest.ts'
import { createPrismaRegistrationWriter } from './prismaWriter.ts'
import { StaleRegistrationError } from './writer.ts'

const legacySsn = 'c2VjcmV0LXNzbg=='

describe('editing a registration on MariaDB (D-197, D-199)', () => {
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

  const id = () => crypto.randomUUID()

  async function build() {
    const tournamentId = id()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, 'Open', '2026-10-23', '2026-10-25', 50, 6, 7.0, 5.0, 'Lanes', 0)`,
      tournamentId,
    )
    const divisionId = id()
    await client.$executeRawUnsafe(
      `INSERT INTO Divisions (Id, Name, Number, TournamentId) VALUES (?, 'Open', 1, ?)`,
      divisionId,
      tournamentId,
    )
    const session = async (type: number) => {
      const sessionId = id()
      await client.$executeRawUnsafe(
        `INSERT INTO Squads
           (Id, TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, Complete,
            SweeperEntryFee, Games, CashRatio)
         VALUES (?, ?, ?, '2026-10-24 09:00:00', 4, 1, 12, 0, ?, ?, ?)`,
        sessionId,
        tournamentId,
        type,
        type === 1 ? 25 : null,
        type === 1 ? 3 : null,
        type === 1 ? 4.0 : null,
      )
      return sessionId
    }
    const squads = [await session(0), await session(0), await session(0)]
    const bowlerId = id()
    await client.$executeRawUnsafe(
      `INSERT INTO Bowlers
         (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
          ZipCode, EmailAddress, PhoneNumber, USBCId, DateOfBirth, Gender, SocialSecurityNumber)
       VALUES (?, 'Ray', 'Q', 'Baptiste', 'Jr', '1 Main St', 'Boston', 'MA', '02101',
               'x@example.com', '6175550100', '1234-56789', '1980-01-01', 1, ?)`,
      bowlerId,
      legacySsn,
    )
    const { logger } = createCapturedLogger()
    const writer = createPrismaRegistrationWriter(client, logger)
    const deps = {
      tournaments: createPrismaTournamentRepository(client, logger),
      divisions: createPrismaDivisionRepository(client, logger),
      sweepers: createPrismaSweeperRepository(client, logger),
      writer,
      now: () => new Date('2026-10-01T12:00:00Z'),
    }
    const added = parseDeskRequest({
      divisionId,
      average: 180,
      squadIds: [squads[0]],
      bowlerId,
    })
    if (!added.success) throw new Error('bad test request')
    const created = await deskRegister(deps, tournamentId, added.data)
    if (!created.ok) throw new Error('create failed')
    const edit = (body: Record<string, unknown>): Promise<EditResult> => {
      const parsed = parseEditRequest(body)
      if (!parsed.success) throw new Error('bad test edit')
      return editRegistration(deps, tournamentId, created.registrationId, parsed.data)
    }
    return {
      tournamentId,
      squads,
      bowlerId,
      registrationId: created.registrationId,
      deps,
      edit,
      writer,
    }
  }

  const heldBy = async (registrationId: string) =>
    (await client.squadRegistration.findMany({ where: { registrationId } })).map((row) => ({
      squadId: row.squadId,
      lane: row.laneAssignment,
    }))

  it('switches a squad, clears a phone, and keeps the SSN, the other lanes, and one placeholder payment (REG-20, REG-21, BWL-16, D-200, D-206)', async () => {
    const { edit, squads, registrationId, bowlerId } = await build()
    await client.$executeRawUnsafe(
      "UPDATE SquadRegistration SET LaneAssignment = '3' WHERE RegistrationId = ? AND SquadId = ?",
      registrationId,
      squads[0],
    )
    // Add squad 1 first, so the swap leaves squad 0 with its lane while squad 1 goes.
    expect(await edit({ addSquadIds: [squads[1]] })).toMatchObject({ ok: true, added: 1 })

    const result = await edit({
      removeSquadIds: [squads[1]],
      addSquadIds: [squads[2]],
      bowler: { phoneNumber: '' },
    })

    expect(result).toMatchObject({ ok: true, added: 1, removed: 1 })
    const held = await heldBy(registrationId)
    expect(held).toHaveLength(2)
    expect(held).toContainEqual({ squadId: squads[0], lane: '3' })
    expect(held).toContainEqual({ squadId: squads[2], lane: '' })
    const bowler = await client.bowler.findUniqueOrThrow({ where: { id: bowlerId } })
    expect(bowler.phoneNumber).toBe('')
    const ssn = await client.$queryRawUnsafe<{ ssn: string }[]>(
      'SELECT SocialSecurityNumber AS ssn FROM Bowlers WHERE Id = ?',
      bowlerId,
    )
    expect(ssn[0]?.ssn).toBe(legacySsn)
    const codes = (await client.payment.findMany()).map((payment) => payment.confirmationCode)
    expect(codes).toHaveLength(3)
    expect(codes.every((code) => /^Manual_/.test(code))).toBe(true)
  })

  it('clears the birth date and gender (D-206)', async () => {
    const { edit, bowlerId } = await build()

    expect(await edit({ bowler: { dateOfBirth: '', gender: '' } })).toMatchObject({ ok: true })

    const bowler = await client.bowler.findUniqueOrThrow({ where: { id: bowlerId } })
    expect(bowler.dateOfBirth).toBeNull()
    expect(bowler.gender).toBeNull()
  })

  it('the guard fails inside the save and writes nothing (D-199)', async () => {
    const { writer, registrationId, bowlerId, squads } = await build()

    await expect(
      writer.save({
        bowler: { id: bowlerId, isNew: false, patch: { email: 'changed@example.com' } },
        registration: {
          id: registrationId,
          isNew: false,
          divisionId: (
            await client.registration.findUniqueOrThrow({ where: { id: registrationId } })
          ).divisionId,
          average: 100,
          superSweeper: false,
        },
        addSessionIds: [squads[1] ?? ''],
        removeSessionIds: [],
        payment: null,
        // The registration already holds squad 0, and not squad 2.
        expect: { present: [squads[2] ?? ''], absent: [squads[0] ?? ''] },
      }),
    ).rejects.toBeInstanceOf(StaleRegistrationError)

    const bowler = await client.bowler.findUniqueOrThrow({ where: { id: bowlerId } })
    expect(bowler.email).toBe('x@example.com')
    expect((await heldBy(registrationId)).map((row) => row.squadId)).toEqual([squads[0]])
    expect(
      (await client.registration.findUniqueOrThrow({ where: { id: registrationId } })).average,
    ).toBe(180)
  })

  it('two desks adding the same squad at once: one saves, the other is told it changed (D-199)', async () => {
    const { edit, registrationId, squads } = await build()

    const [first, second] = await Promise.all([
      edit({ addSquadIds: [squads[1]] }),
      edit({ addSquadIds: [squads[1]] }),
    ])

    const outcomes = [first, second].map((result) =>
      result.ok ? 'saved' : result.ok === false ? result.kind : '',
    )
    expect(outcomes.sort()).toEqual(['changed', 'saved'])
    expect(await heldBy(registrationId)).toHaveLength(2)
    expect(await client.payment.count()).toBe(2)
  })
})
