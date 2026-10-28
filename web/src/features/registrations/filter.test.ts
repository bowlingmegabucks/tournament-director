import { describe, expect, it } from 'vitest'
import { createRegistration } from '../../mocks/data'
import { filterRegistrations } from './filter'

function bowler(firstName: string, lastName: string, usbcId = '') {
  return createRegistration({
    bowler: { ...createRegistration().bowler, firstName, lastName, usbcId },
  })
}

const joeA = bowler('Joe', 'Fontaine', '2045-88123')
const joeB = bowler('Joe', 'Fontaine', '5560-11902')
const dana = bowler('Dana', 'Abbott', '4821-10394')
const tom = bowler('Tom', 'Delgado')
const all = [dana, joeA, joeB, tom]

describe('filterRegistrations (REG-23, D-49)', () => {
  it('returns everyone for empty text', () => {
    expect(filterRegistrations(all, '')).toEqual(all)
  })

  it('returns everyone for text that is only spaces and commas', () => {
    expect(filterRegistrations(all, '  , ,')).toEqual(all)
  })

  it('matches the start of a first name', () => {
    expect(filterRegistrations(all, 'da')).toEqual([dana])
  })

  it('matches the start of a last name', () => {
    expect(filterRegistrations(all, 'font')).toEqual([joeA, joeB])
  })

  it('matches the start of a USBC ID', () => {
    expect(filterRegistrations(all, '2045')).toEqual([joeA])
  })

  it('does not match the middle of a value', () => {
    expect(filterRegistrations(all, 'ontaine')).toEqual([])
    expect(filterRegistrations(all, '88123')).toEqual([])
  })

  it('ignores case', () => {
    expect(filterRegistrations(all, 'FONTAINE')).toEqual([joeA, joeB])
    expect(filterRegistrations([bowler('amy', 'YOUNG')], 'Amy yo')).toHaveLength(1)
  })

  it('needs every word to match, each in any field', () => {
    expect(filterRegistrations(all, 'joe 2045')).toEqual([joeA])
    expect(filterRegistrations(all, 'fontaine joe')).toEqual([joeA, joeB])
    expect(filterRegistrations(all, 'joe abbott')).toEqual([])
  })

  it('ignores commas and extra spaces', () => {
    expect(filterRegistrations(all, ' Fontaine,   Joe ')).toEqual([joeA, joeB])
  })

  it('does not treat an empty USBC ID as a match for a word', () => {
    expect(filterRegistrations([tom], '2')).toEqual([])
  })

  it('keeps the order it was given', () => {
    expect(filterRegistrations([joeB, joeA], 'joe')).toEqual([joeB, joeA])
  })
})
