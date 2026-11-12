import { describe, expect, it } from 'vitest'
import { displayDate, formatTypedDate, valueOfText } from './dateText'

describe('displayDate', () => {
  it('shows a full ISO date as mm/dd/yyyy', () => {
    expect(displayDate('2027-03-12')).toBe('03/12/2027')
  })

  it.each(['', '03/1', '2027-03', '2027-03-12T09:00', 'abc'])('leaves "%s" as it is', (text) => {
    expect(displayDate(text)).toBe(text)
  })
})

describe('formatTypedDate', () => {
  it.each([
    ['0', '0'],
    ['03', '03/'],
    ['03/', '03/'],
    ['03/1', '03/1'],
    ['03/12', '03/12/'],
    ['03/12/2', '03/12/2'],
    ['03/12/2027', '03/12/2027'],
    ['03/12/20277', '03/12/2027'],
  ])('turns "%s" into "%s"', (typed, shown) => {
    expect(formatTypedDate(typed)).toBe(shown)
  })

  it.each([
    ['3/', '03/'],
    ['3-', '03/'],
    ['3.', '03/'],
    ['3 ', '03/'],
    ['3/5/', '03/05/'],
    ['1/2/2027', '01/02/2027'],
    ['12/3/2027', '12/03/2027'],
  ])('treats a separator as the end of a part: "%s" is "%s"', (typed, shown) => {
    expect(formatTypedDate(typed)).toBe(shown)
  })

  it.each([
    ['3', '03/'],
    ['03/5', '03/05/'],
    ['1', '1'],
    ['03/3', '03/3'],
    ['4', '04/'],
  ])(
    'ends a part at once when the digit cannot start a longer one: "%s" is "%s"',
    (typed, shown) => {
      expect(formatTypedDate(typed)).toBe(shown)
    },
  )

  it('ignores a separator with no digit before it, and one after the year', () => {
    expect(formatTypedDate('/')).toBe('')
    expect(formatTypedDate('03//')).toBe('03/')
    expect(formatTypedDate('03/12/2027/')).toBe('03/12/2027')
  })

  it('ignores letters', () => {
    expect(formatTypedDate('0a3')).toBe('03/')
  })

  it('keeps a trailing slash off while deleting, so Backspace works', () => {
    expect(formatTypedDate('03', true)).toBe('03')
    expect(formatTypedDate('03/12', true)).toBe('03/12')
  })

  it('reads a typed or pasted ISO date as it is', () => {
    expect(formatTypedDate('2027-03-12')).toBe('2027-03-12')
    expect(formatTypedDate(' 2027-03-12 ')).toBe('2027-03-12')
  })
})

describe('valueOfText', () => {
  it('gives ISO once the date is complete', () => {
    expect(valueOfText('03/12/2027')).toBe('2027-03-12')
    expect(valueOfText('3/12/2027')).toBe('2027-03-12')
  })

  it('keeps an impossible date, for the form check to refuse', () => {
    expect(valueOfText('02/31/2027')).toBe('2027-02-31')
  })

  it('gives the shown text while the date is not complete', () => {
    expect(valueOfText('03/1')).toBe('03/1')
    expect(valueOfText('')).toBe('')
  })

  it('passes ISO through', () => {
    expect(valueOfText('2027-03-12')).toBe('2027-03-12')
  })
})
