import { describe, expect, it } from 'vitest'
import { createRecapSheet } from '../../mocks/data'
import { filterSheets } from './filter'

const joey = createRecapSheet({ name: 'Joey Royer, Jr.', divisionName: 'Senior' })
const dana = createRecapSheet({ name: 'Dana Ortiz', divisionName: 'Open' })
const sheets = [joey, dana]

describe('filterSheets (RPT-09)', () => {
  it('keeps every sheet when the box is empty or only spaces', () => {
    expect(filterSheets(sheets, '')).toEqual(sheets)
    expect(filterSheets(sheets, '  , ')).toEqual(sheets)
  })

  it('matches the start of a name word, ignoring case', () => {
    expect(filterSheets(sheets, 'ROY')).toEqual([joey])
    expect(filterSheets(sheets, 'dan')).toEqual([dana])
  })

  it('needs every word to start a word, in any order', () => {
    expect(filterSheets(sheets, 'ro jo')).toEqual([joey])
    expect(filterSheets(sheets, 'royer, joey')).toEqual([joey])
    expect(filterSheets(sheets, 'joey ortiz')).toEqual([])
  })

  it('matches the division name too', () => {
    expect(filterSheets(sheets, 'senior')).toEqual([joey])
    expect(filterSheets(sheets, 'dana open')).toEqual([dana])
  })

  it('does not match the middle of a word', () => {
    expect(filterSheets(sheets, 'oyer')).toEqual([])
  })

  it('does not change the order of the sheets', () => {
    const maria = createRecapSheet({ name: 'Maria Ortega', divisionName: 'Open' })

    expect(filterSheets([maria, joey, dana], 'o')).toEqual([maria, dana])
  })
})
