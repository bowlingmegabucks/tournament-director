import { describe, expect, it } from 'vitest'
import { toLaneEntry, type LaneEntryRow } from './entryRow.ts'

function row(
  overrides: Partial<NonNullable<LaneEntryRow['registration']>> = {},
  laneAssignment: string | null = '1A',
): LaneEntryRow {
  return {
    registrationId: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
    laneAssignment,
    registration: {
      id: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
      bowlerId: '5a9e3c71-8d24-4b6f-9c10-2e7a4f6b8d33',
      average: 200,
      superSweeper: true,
      divisionId: '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01',
      bowler: { firstName: 'Joe', lastName: 'Fontaine', suffix: '' },
      ...overrides,
    },
  }
}

describe('toLaneEntry', () => {
  it('maps a stored entry (LAN-01, LAN-11)', () => {
    expect(toLaneEntry(row())).toEqual({
      success: true,
      data: {
        registrationId: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
        bowlerId: '5a9e3c71-8d24-4b6f-9c10-2e7a4f6b8d33',
        divisionId: '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01',
        average: 200,
        firstName: 'Joe',
        lastName: 'Fontaine',
        name: 'Joe Fontaine',
        superSweeper: true,
        position: '1A',
      },
    })
  })

  it.each([null, ''])('reads a position of %j as unassigned (LAN-01, D-58)', (stored) => {
    const result = toLaneEntry(row({}, stored))

    expect(result.success && result.data.position).toBe('')
  })

  it('names the bowler as BWL-13 says, with a suffix', () => {
    const result = toLaneEntry(
      row({ bowler: { firstName: 'Joe', lastName: 'Fontaine', suffix: 'Jr' } }),
    )

    expect(result.success && result.data.name).toBe('Joe Fontaine, Jr')
  })

  it('accepts a missing average', () => {
    const result = toLaneEntry(row({ average: null }))

    expect(result.success && result.data.average).toBeNull()
  })

  it.each([
    ['a registration id that is not a UUID', { id: 'nope' }],
    ['a division id that is not a UUID', { divisionId: 'nope' }],
    ['a bowler id that is not a UUID', { bowlerId: 'nope' }],
    ['a fractional average', { average: 200.5 }],
    ['no first name', { bowler: { firstName: '', lastName: 'Fontaine', suffix: '' } }],
    ['no last name', { bowler: { firstName: 'Joe', lastName: '', suffix: '' } }],
  ])('does not fit with %s (D-51)', (_name, overrides) => {
    expect(toLaneEntry(row(overrides)).success).toBe(false)
  })

  it.each([
    ['no registration', { ...row(), registration: null }],
    ['no bowler', row({ bowler: null })],
  ])('does not fit with %s and does not throw (D-51)', (_name, entry) => {
    expect(toLaneEntry(entry).success).toBe(false)
  })
})
