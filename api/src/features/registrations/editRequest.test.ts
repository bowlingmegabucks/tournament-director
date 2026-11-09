import { describe, expect, it } from 'vitest'
import { parseEditRequest, toEditBowlerPatch } from './editRequest.ts'

describe('parseEditRequest (D-197, D-199)', () => {
  it('accepts an empty change and fills the defaults', () => {
    const parsed = parseEditRequest({})

    expect(parsed).toEqual({
      success: true,
      data: {
        addSquadIds: [],
        removeSquadIds: [],
        addSweeperIds: [],
        removeSweeperIds: [],
        bowler: {},
        confirmWarnings: false,
      },
    })
  })

  it.each([
    ['a blank average clears it', { average: '' }, null],
    ['null clears it', { average: null }, null],
    ['a number sets it', { average: 175 }, 175],
  ])('reads the average: %s (REG-16)', (_name, body, expected) => {
    const parsed = parseEditRequest(body)

    expect(parsed.success && parsed.data.average).toBe(expected)
  })

  it('leaves the average undefined when the key is missing (REG-16)', () => {
    const parsed = parseEditRequest({})

    expect(parsed.success && 'average' in parsed.data && parsed.data.average !== undefined).toBe(
      false,
    )
  })

  it.each([
    [0, 'Average must be greater than 0.'],
    [301, 'Average must be less than or equal to 300.'],
    [180.5, 'Enter a whole number'],
    ['abc', 'Enter a number'],
  ])('refuses the average %s with its message (REG-16)', (average, message) => {
    expect(parseEditRequest({ average })).toMatchObject({
      success: false,
      errors: { average: message },
    })
  })

  it('names the field of a bowler error by its path', () => {
    expect(parseEditRequest({ bowler: { state: 'NCX' } })).toMatchObject({
      success: false,
      errors: { 'bowler.state': 'State must be Postal Abbreviation' },
      message: 'State must be Postal Abbreviation',
    })
  })

  it('refuses a bad division id', () => {
    expect(parseEditRequest({ divisionId: 'x' })).toMatchObject({
      success: false,
      errors: { divisionId: 'Pick a division' },
    })
  })
})

describe('toEditBowlerPatch (D-206)', () => {
  it('leaves out every field the request did not send', () => {
    expect(toEditBowlerPatch({})).toEqual({})
  })

  it('trims text and clears a field sent empty', () => {
    expect(
      toEditBowlerPatch({ firstName: ' Ann ', email: '', suffix: ' ', usbcId: '', city: ' ' }),
    ).toEqual({ firstName: 'Ann', email: '', suffix: '', usbcId: '', city: '' })
  })

  it('formats the phone and zip (BWL-07a)', () => {
    expect(toEditBowlerPatch({ phoneNumber: '+1 617-555-0100', zipCode: '02101-1234' })).toEqual({
      phoneNumber: '6175550100',
      zipCode: '021011234',
    })
    expect(toEditBowlerPatch({ phoneNumber: '', zipCode: '' })).toEqual({
      phoneNumber: '',
      zipCode: '',
    })
  })

  it('turns an empty birth date or gender into null, and keeps a value', () => {
    expect(toEditBowlerPatch({ dateOfBirth: '', gender: '' })).toEqual({
      dateOfBirth: null,
      gender: null,
    })
    expect(toEditBowlerPatch({ dateOfBirth: '1970-01-02', gender: 'Female' })).toEqual({
      dateOfBirth: '1970-01-02',
      gender: 'Female',
    })
  })
})
