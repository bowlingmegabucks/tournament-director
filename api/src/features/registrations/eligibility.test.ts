import { describe, expect, it } from 'vitest'
import { createDivision } from '../../test/factories.ts'
import { ageOn, checkEligibility, type EligibilityInput } from './eligibility.ts'

function check(overrides: {
  division?: Partial<EligibilityInput['division']>
  average?: number | null
  bowler?: Partial<EligibilityInput['bowler']>
}): string[] {
  return checkEligibility({
    division: createDivision(overrides.division),
    average: overrides.average === undefined ? 180 : overrides.average,
    bowler: {
      dateOfBirth: '1980-06-15',
      gender: 'Male',
      usbcId: '1234-56789',
      ...overrides.bowler,
    },
    tournamentStart: '2026-10-23',
  }).map((failure) => failure.description)
}

describe('ageOn (BWL-09)', () => {
  it.each([
    ['1980-10-23', 46],
    ['1980-10-24', 45],
    ['1980-10-22', 46],
    ['1980-11-01', 45],
    ['1980-01-01', 46],
  ])('born %s is %i on 2026-10-23', (born, age) => {
    expect(ageOn(born, '2026-10-23')).toBe(age)
  })
})

describe('average limits (REG-04a to REG-04c)', () => {
  it('needs an average when the division has a limit (REG-04a)', () => {
    expect(check({ division: { minimumAverage: 150 }, average: null })).toEqual([
      'Average is required for selected division',
    ])
    expect(check({ division: { maximumAverage: 200 }, average: null })).toEqual([
      'Average is required for selected division',
    ])
    expect(check({ average: null })).toEqual([])
  })

  it('needs the average to reach the minimum (REG-04b)', () => {
    const division = { minimumAverage: 150 }
    expect(check({ division, average: 149 })).toEqual([
      'Minimum average requirement for division not met',
    ])
    expect(check({ division, average: 150 })).toEqual([])
  })

  it('needs the average not to pass the maximum (REG-04c)', () => {
    const division = { maximumAverage: 200 }
    expect(check({ division, average: 201 })).toEqual([
      'Maximum average requirement for division not met',
    ])
    expect(check({ division, average: 200 })).toEqual([])
  })
})

describe('age limits (REG-04d to REG-04f)', () => {
  it('needs a birth date when the division has an age limit and no gender (REG-04d)', () => {
    const division = { minimumAge: 50 }
    expect(check({ division, bowler: { dateOfBirth: null } })).toContain(
      'Date of birth required for selected division',
    )
  })

  it('refuses a bowler under the minimum age on the start date (REG-04e)', () => {
    const division = { minimumAge: 50 }
    expect(check({ division })).toEqual(['Bowler too young for selected division'])
    expect(check({ division: { minimumAge: 46 } })).toEqual([])
  })

  it('refuses a bowler over the maximum age (REG-04f)', () => {
    const division = { maximumAge: 40 }
    expect(check({ division })).toEqual(['Bowler too old for selected division'])
    expect(check({ division: { maximumAge: 46 } })).toEqual([])
  })

  it('counts a missing birth date as too young, not too old', () => {
    const missing = { dateOfBirth: null }
    expect(check({ division: { minimumAge: 50, gender: 'Female' }, bowler: missing })).toEqual([
      'Bowler too young for selected division',
    ])
    expect(check({ division: { maximumAge: 40, gender: 'Female' }, bowler: missing })).toEqual([])
  })
})

describe('gender (REG-04g, REG-04h)', () => {
  it('lets the division gender in, and refuses the other (division gender only)', () => {
    const division = { gender: 'Female' as const }
    expect(check({ division, bowler: { gender: 'Female' } })).toEqual([])
    expect(check({ division, bowler: { gender: 'Male' } })).toEqual([
      'Invalid gender for selected division',
    ])
  })

  it('needs a gender when the division has one and no age limit (REG-04g)', () => {
    expect(check({ division: { gender: 'Female' }, bowler: { gender: null } })).toEqual([
      'Gender is required for selected division',
      'Invalid gender for selected division',
    ])
  })

  it('lets that gender or an age inside the limits in ("Women or Seniors")', () => {
    const division = { gender: 'Female' as const, minimumAge: 60 }
    expect(check({ division, bowler: { gender: 'Female' } })).toEqual([])
    expect(check({ division, bowler: { gender: 'Male', dateOfBirth: '1950-01-01' } })).toEqual([])
    expect(check({ division, bowler: { gender: 'Male' } })).toEqual([
      'Bowler too young for selected division',
    ])
  })

  it('does not check the gender when the division has an age limit (REG-04g)', () => {
    const division = { gender: 'Female' as const, maximumAge: 99 }
    expect(check({ division, bowler: { gender: 'Male' } })).toEqual([])
  })
})

describe('handicap divisions (REG-05)', () => {
  it('need a USBC id', () => {
    expect(check({ division: { handicapPercentage: 90 }, bowler: { usbcId: '' } })).toEqual([
      'USBC Id is required for Handicap Divisions',
    ])
    expect(check({ division: { handicapPercentage: 90 } })).toEqual([])
    expect(check({ bowler: { usbcId: '' } })).toEqual([])
  })
})

it('marks every failure as a validation error, a 400 for everyone (D-107)', () => {
  const failures = checkEligibility({
    division: createDivision({ minimumAverage: 150 }),
    average: 100,
    bowler: { dateOfBirth: null, gender: null, usbcId: '1-1' },
    tournamentStart: '2026-10-23',
  })
  expect(failures).not.toHaveLength(0)
  expect(failures.every((failure) => failure.kind === 'validation')).toBe(true)
})
