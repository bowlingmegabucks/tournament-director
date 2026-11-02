import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { createCommonBowler } from './bowler.testData.ts'
import { deleteRegistration } from './delete.ts'
import { createInMemoryRegistrationWriter, type StoredSession } from './writer.ts'

const session = (tournamentId: string, complete = false): StoredSession => ({
  id: faker.string.uuid(),
  tournamentId,
  kind: 'squad',
  complete,
})

function setup(scoredIn: 'here' | 'elsewhere' | 'none', complete = false) {
  const tournamentId = faker.string.uuid()
  const squad = session(tournamentId, complete)
  const elsewhere = session(faker.string.uuid())
  const bowler = createCommonBowler()
  const registrationId = faker.string.uuid()
  const { writer, state } = createInMemoryRegistrationWriter({
    bowlers: [bowler],
    sessions: [squad, elsewhere],
    registrations: [
      {
        tournamentId,
        registration: {
          id: registrationId,
          bowlerId: bowler.id,
          divisionId: faker.string.uuid(),
          average: 180,
          superSweeper: false,
          sessionIds: [squad.id],
        },
      },
      {
        tournamentId,
        registration: {
          id: faker.string.uuid(),
          bowlerId: faker.string.uuid(),
          divisionId: faker.string.uuid(),
          average: 150,
          superSweeper: false,
          sessionIds: [],
        },
      },
    ],
    // The second payment belongs to another registration: a delete must leave it.
    payments: [
      { registrationId, confirmationCode: 'Stripe_1' },
      { registrationId: 'other-registration', confirmationCode: 'Stripe_2' },
    ],
    scores:
      scoredIn === 'none'
        ? []
        : [{ bowlerId: bowler.id, sessionId: scoredIn === 'here' ? squad.id : elsewhere.id }],
  })
  return { writer, state, registrationId, bowler }
}

describe('deleting a registration (API-08, REG-19)', () => {
  it('removes the registration and its payments, and keeps the bowler and other registrations', async () => {
    const { writer, state, registrationId, bowler } = setup('none')

    const result = await deleteRegistration(writer, registrationId)

    expect(result).toEqual({ ok: true })
    expect(state.registrations.map((entry) => entry.registration.id)).not.toContain(registrationId)
    expect(state.registrations).toHaveLength(1)
    expect(state.payments).toEqual([
      { registrationId: 'other-registration', confirmationCode: 'Stripe_2' },
    ])
    expect(state.bowlers.map((b) => b.id)).toEqual([bowler.id])
  })

  it('reports an unknown registration as not found', async () => {
    const { writer, state } = setup('none')

    const result = await deleteRegistration(writer, faker.string.uuid())

    expect(result).toEqual({ ok: false, reason: 'notFound' })
    expect(state.registrations).toHaveLength(2)
  })

  it('refuses once the bowler has a score in the tournament, and deletes nothing', async () => {
    const { writer, state, registrationId } = setup('here')

    const result = await deleteRegistration(writer, registrationId)

    expect(result).toEqual({
      ok: false,
      reason: 'refused',
      failures: [
        expect.objectContaining({
          kind: 'validation',
          code: 'Registration.HasScores',
          description: 'Cannot delete registration with scores.',
        }),
      ],
    })
    expect(state.registrations).toHaveLength(2)
    expect(state.payments).toHaveLength(2)
  })

  it('refuses for a complete squad, since completion wrote scores (D-10)', async () => {
    const { writer, registrationId } = setup('here', true)

    const result = await deleteRegistration(writer, registrationId)

    expect(result).toMatchObject({ ok: false, reason: 'refused' })
  })

  it('ignores a score from another tournament', async () => {
    const { writer, registrationId } = setup('elsewhere')

    const result = await deleteRegistration(writer, registrationId)

    expect(result).toEqual({ ok: true })
  })
})
