import { describe, expect, it } from 'vitest'
import { filterAverages } from './filter'
import type { AverageRow } from './types'

const row = (overrides: Partial<AverageRow>): AverageRow => ({
  registrationId: 'r',
  bowlerName: 'Carla Mendes',
  divisionName: 'Handicap A',
  usbcId: '412-8830',
  providedAverage: 187,
  status: 'unverified',
  averageInUse: 187,
  note: null,
  verifiedBy: null,
  verifiedAt: null,
  ...overrides,
})

const carla = row({ registrationId: 'a' })
const bill = row({
  registrationId: 'b',
  bowlerName: 'Bill Tran',
  usbcId: '390-1142',
  status: 'adjusted',
})
const anita = row({
  registrationId: 'c',
  bowlerName: 'Anita Brooks',
  usbcId: '455-0921',
  status: 'verified',
})
const all = [carla, bill, anita]

describe('filterAverages (AVG-02, D-295)', () => {
  it('keeps only unverified rows under Unverified', () => {
    expect(filterAverages(all, 'unverified', '')).toEqual([carla])
  })

  it('keeps every row under All', () => {
    expect(filterAverages(all, 'all', '')).toEqual(all)
  })

  it('matches words that start a name, ignoring case', () => {
    expect(filterAverages(all, 'all', 'br')).toEqual([anita])
    expect(filterAverages(all, 'all', 'TRAN bill')).toEqual([bill])
  })

  it('matches the USBC ID', () => {
    expect(filterAverages(all, 'all', '390')).toEqual([bill])
  })

  it('needs every word to match', () => {
    expect(filterAverages(all, 'all', 'bill brooks')).toEqual([])
  })

  it('combines the filter and the text', () => {
    expect(filterAverages(all, 'unverified', 'bill')).toEqual([])
    expect(filterAverages(all, 'unverified', 'carla')).toEqual([carla])
  })
})
