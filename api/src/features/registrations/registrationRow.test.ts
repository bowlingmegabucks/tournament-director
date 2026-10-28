import { describe, expect, it } from 'vitest'
import { displayName, toRegistration, type RegistrationRow } from './registrationRow.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const otherTournamentId = '22222222-2222-4222-8222-222222222222'
const squadId = '33333333-3333-4333-8333-333333333333'
const sweeperId = '44444444-4444-4444-8444-444444444444'

function createRow(overrides: Partial<RegistrationRow> = {}): RegistrationRow {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    superSweeper: false,
    bowler: {
      id: '66666666-6666-4666-8666-666666666666',
      firstName: 'Ray',
      lastName: 'Baptiste',
      suffix: '',
      usbcId: '1190-55820',
    },
    divisionId: '77777777-7777-4777-8777-777777777777',
    division: { name: 'Open' },
    squads: [],
    ...overrides,
  }
}

describe('displayName', () => {
  it('is first and last name (BWL-13)', () => {
    expect(displayName({ firstName: 'John', lastName: 'Smith', suffix: '' })).toBe('John Smith')
  })

  it('adds a comma and the suffix when there is one (BWL-13)', () => {
    expect(displayName({ firstName: 'John', lastName: 'Smith', suffix: 'Jr' })).toBe(
      'John Smith, Jr',
    )
  })
})

describe('toRegistration', () => {
  it('reads a stored row into the list shape (REG-23, BWL-13)', () => {
    const result = toRegistration(
      createRow({
        superSweeper: true,
        bowler: { ...createRow().bowler, suffix: 'Jr' },
        squads: [
          { squad: { id: squadId, tournamentId, squadType: 0 } },
          { squad: { id: sweeperId, tournamentId, squadType: 1 } },
        ],
      }),
      tournamentId,
    )

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      id: '55555555-5555-4555-8555-555555555555',
      bowler: {
        id: '66666666-6666-4666-8666-666666666666',
        name: 'Ray Baptiste, Jr',
        firstName: 'Ray',
        lastName: 'Baptiste',
        usbcId: '1190-55820',
      },
      divisionId: '77777777-7777-4777-8777-777777777777',
      divisionName: 'Open',
      superSweeper: true,
      squadIds: [squadId],
      sweeperIds: [sweeperId],
    })
  })

  it('keeps an empty USBC ID as an empty string (REG-23)', () => {
    const result = toRegistration(
      createRow({ bowler: { ...createRow().bowler, usbcId: '' } }),
      tournamentId,
    )

    expect(result.data?.bowler.usbcId).toBe('')
  })

  it('ignores a squad of another tournament (D-51)', () => {
    const result = toRegistration(
      createRow({
        squads: [{ squad: { id: squadId, tournamentId: otherTournamentId, squadType: 0 } }],
      }),
      tournamentId,
    )

    expect(result.data?.squadIds).toEqual([])
  })

  it('ignores a session that is neither squad nor sweeper (D-51)', () => {
    const result = toRegistration(
      createRow({ squads: [{ squad: { id: squadId, tournamentId, squadType: 2 } }] }),
      tournamentId,
    )

    expect(result.data?.squadIds).toEqual([])
    expect(result.data?.sweeperIds).toEqual([])
  })

  it.each([
    ['first name', { firstName: '' }],
    ['last name', { lastName: '' }],
  ])('rejects a bowler with an empty %s (D-51)', (_label, bowlerFields) => {
    const result = toRegistration(
      createRow({ bowler: { ...createRow().bowler, ...bowlerFields } }),
      tournamentId,
    )

    expect(result.success).toBe(false)
  })

  it('rejects a registration id that is not a UUID (D-51)', () => {
    expect(toRegistration(createRow({ id: 'x' }), tournamentId).success).toBe(false)
  })

  it('does not carry the SSN, gender, or birth date (BWL-17)', () => {
    const row = {
      ...createRow(),
      bowler: {
        ...createRow().bowler,
        socialSecurityNumber: 'c2VjcmV0',
        gender: 0,
        dateOfBirth: new Date('1980-01-01'),
      },
    }

    const result = toRegistration(row, tournamentId)

    expect(JSON.stringify(result.data)).not.toMatch(/socialSecurity|c2VjcmV0|gender|dateOfBirth/)
  })
})
