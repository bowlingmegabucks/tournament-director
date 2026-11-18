import { describe, expect, it } from 'vitest'
import { displayName, toRegistration, type RegistrationRow } from './registrationRow.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const otherTournamentId = '22222222-2222-4222-8222-222222222222'
const squadId = '33333333-3333-4333-8333-333333333333'
const sweeperId = '44444444-4444-4444-8444-444444444444'

function createBowler(): NonNullable<RegistrationRow['bowler']> {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    firstName: 'Ray',
    lastName: 'Baptiste',
    suffix: '',
    usbcId: '1190-55820',
  }
}

function createRow(overrides: Partial<RegistrationRow> = {}): RegistrationRow {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    superSweeper: false,
    average: 200,
    bowler: createBowler(),
    divisionId: '77777777-7777-4777-8777-777777777777',
    division: { name: 'Open', handicapPercentage: null },
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
  it('does not fit when the bowler is missing, and does not throw (D-51)', () => {
    const result = toRegistration(createRow({ bowler: null }), tournamentId)

    expect(result.success).toBe(false)
  })

  it('reads a stored row into the list shape (REG-23, BWL-13)', () => {
    const result = toRegistration(
      createRow({
        superSweeper: true,
        bowler: { ...createBowler(), suffix: 'Jr' },
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
      average: 200,
      averageStatus: 'none',
      squadIds: [squadId],
      sweeperIds: [sweeperId],
    })
  })

  describe('the average and its check (AVG-09, AVG-11, D-288)', () => {
    const handicapRow = (average: number | null = 175) =>
      createRow({ average, division: { name: 'Handicap A', handicapPercentage: 90 } })

    it('is unverified in a handicap division with no check', () => {
      expect(toRegistration(handicapRow(), tournamentId).data).toMatchObject({
        average: 175,
        averageStatus: 'unverified',
      })
    })

    it('shows the verified average and says verified', () => {
      const check = { providedAverage: 175, verifiedAverage: 175, note: null }
      expect(toRegistration(handicapRow(), tournamentId, check).data).toMatchObject({
        average: 175,
        averageStatus: 'verified',
      })
    })

    it('shows the adjusted average and says adjusted', () => {
      const check = { providedAverage: 175, verifiedAverage: 182, note: 'USBC book' }
      expect(toRegistration(handicapRow(), tournamentId, check).data).toMatchObject({
        average: 182,
        averageStatus: 'adjusted',
      })
    })

    it('has no average when the bowler gave none and no one checked', () => {
      expect(toRegistration(handicapRow(null), tournamentId).data).toMatchObject({
        average: null,
        averageStatus: 'unverified',
      })
    })

    it('says none in a division with no handicap, with the average the bowler gave', () => {
      expect(toRegistration(createRow({ average: 214 }), tournamentId).data).toMatchObject({
        average: 214,
        averageStatus: 'none',
      })
    })
  })

  it('keeps an empty USBC ID as an empty string (REG-23)', () => {
    const result = toRegistration(
      createRow({ bowler: { ...createBowler(), usbcId: '' } }),
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
      createRow({ bowler: { ...createBowler(), ...bowlerFields } }),
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
        ...createBowler(),
        socialSecurityNumber: 'c2VjcmV0',
        gender: 0,
        dateOfBirth: new Date('1980-01-01'),
      },
    }

    const result = toRegistration(row, tournamentId)

    expect(JSON.stringify(result.data)).not.toMatch(/socialSecurity|c2VjcmV0|gender|dateOfBirth/)
  })
})
