import { describe, expect, it } from 'vitest'
import { describeChange } from './describeChange'
import type { DivisionFormValues } from './types'
import { emptyDivisionForm } from './validateDivision'

const form = (overrides: Partial<DivisionFormValues>): DivisionFormValues => ({
  ...emptyDivisionForm,
  ...overrides,
})

describe('describeChange (D-147)', () => {
  it('shows the percent with a % sign on both sides', () => {
    expect(
      describeChange(
        'handicapPercentage',
        form({ handicapPercentage: '90' }),
        form({ handicapPercentage: '85' }),
      ),
    ).toBe('Handicap percent: 90% → 85%')
  })

  it('says "not set" for a blank box, before and after', () => {
    expect(describeChange('minimumAge', form({}), form({ minimumAge: '18' }))).toBe(
      'Minimum age: not set → 18',
    )
    expect(describeChange('maximumAverage', form({ maximumAverage: '200' }), form({}))).toBe(
      'Maximum average: 200 → not set',
    )
  })

  it('says "any gender" for the empty choice', () => {
    expect(describeChange('gender', form({ gender: 'Female' }), form({ gender: '' }))).toBe(
      'Gender: Female → any gender',
    )
    expect(describeChange('gender', form({}), form({ gender: 'Male' }))).toBe(
      'Gender: any gender → Male',
    )
  })

  it.each([
    ['name', 'Name'],
    ['maximumAge', 'Maximum age'],
    ['minimumAverage', 'Minimum average'],
    ['handicapBase', 'Handicap base'],
    ['maximumHandicapPerGame', 'Maximum handicap per game'],
  ] as const)('names %s as "%s"', (field, label) => {
    expect(describeChange(field, form({ [field]: ' 1 ' }), form({ [field]: '2' }))).toBe(
      `${label}: 1 → 2`,
    )
  })
})
