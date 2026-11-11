import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { legacyRows, type LegacyRows } from '../../test/legacyRows.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaScoreWriter } from './prismaScoreWriter.ts'
import type { SessionKind } from './scoreWriter.ts'

const at = '2026-10-24 09:00:00'

describe('Prisma score writer', () => {
  let client: PrismaClient
  let rows: LegacyRows

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
    rows = legacyRows(client)
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(client)
  })

  // The raw tournament has 6 games; the sweeper's own games are set on its row.
  async function world(options: { completed?: boolean; sessionComplete?: boolean } = {}) {
    const tournamentId = await rows.tournament({ completed: options.completed })
    const divisionId = await rows.division(tournamentId)
    const squadId = await rows.session(tournamentId, 'squad', at)
    const sweeperId = await rows.session(tournamentId, 'sweeper', at)
    await client.$executeRawUnsafe('UPDATE Squads SET Games = 2 WHERE Id = ?', sweeperId)
    if (options.sessionComplete) {
      await client.$executeRawUnsafe('UPDATE Squads SET Complete = 1 WHERE Id = ?', squadId)
    }
    const enter = async (sessionId: string) => {
      const { registrationId, bowlerId } = await rows.registration(divisionId)
      await rows.squadEntry(registrationId, sessionId, '1A')
      return { registrationId, bowlerId }
    }
    return { tournamentId, squadId, sweeperId, enter }
  }

  const stored = async (bowlerId: string, sessionId: string) =>
    (
      await client.$queryRawUnsafe<{ Game: number; Score: number }[]>(
        'SELECT Game, Score FROM SquadScores WHERE BowlerId = ? AND SquadId = ? ORDER BY Game',
        bowlerId,
        sessionId,
      )
    ).map((row) => [Number(row.Game), Number(row.Score)])

  const writer = () => createPrismaScoreWriter(client, createCapturedLogger().logger)
  const change = (
    tournamentId: string,
    sessionId: string,
    registrationId: string,
    game: number,
    score?: number,
    kind: SessionKind = 'squad',
  ) => ({ tournamentId, kind, sessionId, registrationId, game, score })

  it('saves a score and answers the plan (SCR-01, SCR-19, D-228)', async () => {
    const { tournamentId, squadId, enter } = await world()
    const { registrationId, bowlerId } = await enter(squadId)

    const result = await writer().change(change(tournamentId, squadId, registrationId, 1, 212))

    expect(result).toMatchObject({
      plan: { type: 'save', scores: [212, null, null, null, null, null] },
    })
    expect(await stored(bowlerId, squadId)).toEqual([[1, 212]])
  })

  it('fills the games before with 0 in the same save (SCR-03, D-229)', async () => {
    const { tournamentId, squadId, enter } = await world()
    const { registrationId, bowlerId } = await enter(squadId)

    await writer().change(change(tournamentId, squadId, registrationId, 3, 167))

    expect(await stored(bowlerId, squadId)).toEqual([
      [1, 0],
      [2, 0],
      [3, 167],
    ])
  })

  it('replaces a score and a filled 0 without a second row (SCR-04, D-229)', async () => {
    const { tournamentId, squadId, enter } = await world()
    const { registrationId, bowlerId } = await enter(squadId)
    await writer().change(change(tournamentId, squadId, registrationId, 2, 150))

    await writer().change(change(tournamentId, squadId, registrationId, 1, 190))
    await writer().change(change(tournamentId, squadId, registrationId, 2, 160))

    expect(await stored(bowlerId, squadId)).toEqual([
      [1, 190],
      [2, 160],
    ])
  })

  it('leaves other bowlers and other sessions alone (SCR-05, SCR-06, D-228)', async () => {
    const { tournamentId, squadId, sweeperId, enter } = await world()
    const mine = await enter(squadId)
    const friend = await enter(squadId)
    await writer().change(change(tournamentId, squadId, friend.registrationId, 1, 200))
    await rows.score(mine.bowlerId, sweeperId, 1)

    await writer().change(change(tournamentId, squadId, mine.registrationId, 1, 150))
    await writer().change(change(tournamentId, squadId, mine.registrationId, 1))

    expect(await stored(friend.bowlerId, squadId)).toEqual([[1, 200]])
    expect(await stored(mine.bowlerId, squadId)).toEqual([])
    expect(await stored(mine.bowlerId, sweeperId)).toHaveLength(1)
  })

  it('clears the last game and refuses a gap (SCR-06, D-229)', async () => {
    const { tournamentId, squadId, enter } = await world()
    const { registrationId, bowlerId } = await enter(squadId)
    await writer().change(change(tournamentId, squadId, registrationId, 2, 180))

    const gap = await writer().change(change(tournamentId, squadId, registrationId, 1))
    expect(gap).toEqual({ plan: { type: 'refused', message: 'Clear game 2 first.' } })
    await writer().change(change(tournamentId, squadId, registrationId, 2))

    expect(await stored(bowlerId, squadId)).toEqual([[1, 0]])
  })

  it("uses a sweeper's own games, and a squad's are the tournament's (D-238)", async () => {
    const { tournamentId, sweeperId, squadId, enter } = await world()
    const inSweeper = await enter(sweeperId)
    const inSquad = await enter(squadId)

    const tooFarSweeper = await writer().change(
      change(tournamentId, sweeperId, inSweeper.registrationId, 3, 200, 'sweeper'),
    )
    const sixthGame = await writer().change(
      change(tournamentId, squadId, inSquad.registrationId, 6, 200),
    )
    const seventhGame = await writer().change(
      change(tournamentId, squadId, inSquad.registrationId, 7, 200),
    )

    expect(tooFarSweeper).toMatchObject({
      plan: { type: 'invalid', message: 'Game must be from 1 to 2.' },
    })
    expect(sixthGame).toMatchObject({ plan: { type: 'save' } })
    expect(seventhGame).toMatchObject({ plan: { type: 'invalid' } })
  })

  it('refuses a complete session and a complete tournament and writes nothing (SCR-14, D-231)', async () => {
    const done = await world({ sessionComplete: true })
    const one = await done.enter(done.squadId)
    const refused = await writer().change(
      change(done.tournamentId, done.squadId, one.registrationId, 1, 200),
    )
    expect(refused).toMatchObject({ plan: { type: 'refused' } })
    expect(await stored(one.bowlerId, done.squadId)).toEqual([])

    const frozen = await world({ completed: true })
    const two = await frozen.enter(frozen.squadId)
    const refusedToo = await writer().change(
      change(frozen.tournamentId, frozen.squadId, two.registrationId, 1, 200),
    )
    expect(refusedToo).toMatchObject({ plan: { type: 'refused' } })
  })

  it('answers not found for an unknown tournament, a session of another tournament or kind, and a bowler not entered (SCR-19)', async () => {
    const { tournamentId, squadId, sweeperId, enter } = await world()
    const entered = await enter(squadId)
    const other = await world()
    const unknown = crypto.randomUUID()

    expect(await writer().change(change(unknown, squadId, entered.registrationId, 1, 200))).toEqual(
      { notFound: 'tournament' },
    )
    expect(
      await writer().change(change(other.tournamentId, squadId, entered.registrationId, 1, 200)),
    ).toEqual({ notFound: 'session' })
    expect(
      await writer().change(change(tournamentId, sweeperId, entered.registrationId, 1, 200)),
    ).toEqual({ notFound: 'session' })
    expect(await writer().change(change(tournamentId, squadId, unknown, 1, 200))).toEqual({
      notFound: 'bowler',
    })
    const inSweeper = await enter(sweeperId)
    expect(
      await writer().change(change(tournamentId, squadId, inSweeper.registrationId, 1, 200)),
    ).toEqual({ notFound: 'bowler' })
  })

  it('keeps every score when two saves for one bowler arrive together (D-228)', async () => {
    const { tournamentId, squadId, enter } = await world()
    const { registrationId, bowlerId } = await enter(squadId)

    await Promise.all([
      writer().change(change(tournamentId, squadId, registrationId, 3, 150)),
      writer().change(change(tournamentId, squadId, registrationId, 2, 160)),
    ])

    expect(await stored(bowlerId, squadId)).toEqual([
      [1, 0],
      [2, 160],
      [3, 150],
    ])
  })

  it('removes the flag of a bowler who scores again and leaves the others (SCR-25, D-250)', async () => {
    const { tournamentId, squadId, enter } = await world()
    const walked = await enter(squadId)
    const other = await enter(squadId)
    await client.sessionDnf.createMany({
      data: [
        { sessionId: squadId, registrationId: walked.registrationId },
        { sessionId: squadId, registrationId: other.registrationId },
      ],
    })

    await writer().change(change(tournamentId, squadId, walked.registrationId, 1, 190))

    const left = await client.sessionDnf.findMany()
    expect(left.map((row) => row.registrationId)).toEqual([other.registrationId])
  })

  it('keeps the flag when the score is cleared or the save is refused (SCR-25)', async () => {
    const { tournamentId, squadId, enter } = await world()
    const walked = await enter(squadId)
    await writer().change(change(tournamentId, squadId, walked.registrationId, 1, 190))
    await client.sessionDnf.create({
      data: { sessionId: squadId, registrationId: walked.registrationId },
    })

    await writer().change(change(tournamentId, squadId, walked.registrationId, 1))
    await writer().change(change(tournamentId, squadId, walked.registrationId, 1, 999))

    expect(await client.sessionDnf.count()).toBe(1)
  })
})
