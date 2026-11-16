import { describe, expect, it } from 'vitest'
import { createLaneBowler, createLanePage, createLanePair } from '../../mocks/data'
import { buildCheckIn, checkInName } from './checkIn'

const names = (rows: { name: string }[]) => rows.map((row) => row.name)

function bowler(firstName: string, lastName: string, suffix = '', position = '') {
  return createLaneBowler({
    firstName,
    lastName,
    suffix,
    name: `${firstName} ${lastName}`,
    position,
  })
}

describe('checkInName', () => {
  it('writes last name, first name', () => {
    expect(checkInName({ firstName: 'Joe', lastName: 'Fontaine', suffix: '' })).toBe(
      'Fontaine, Joe',
    )
  })

  it('adds the suffix at the end', () => {
    expect(checkInName({ firstName: 'Joe', lastName: 'Fontaine', suffix: 'Jr' })).toBe(
      'Fontaine, Joe, Jr',
    )
  })
})

describe('buildCheckIn', () => {
  it('by name lists everyone in one group, last name then first name, with the suffix last', () => {
    const page = createLanePage({
      pairs: [
        createLanePair(1, [
          bowler('Zed', 'Adams', '', '1A'),
          bowler('Joe', 'Fontaine', 'Jr', '1B'),
        ]),
        createLanePair(3, [
          bowler('Joe', 'Fontaine', 'Sr', '3A'),
          bowler('Joe', 'Fontaine', '', '3B'),
        ]),
      ],
      unassigned: [bowler('Amy', 'Adams')],
      other: [bowler('Bo', 'baker', '', 'X')],
    })

    const groups = buildCheckIn(page, 'name')

    expect(groups).toHaveLength(1)
    expect(groups[0]?.heading).toBeUndefined()
    expect(names(groups[0]?.rows ?? [])).toEqual([
      'Adams, Amy',
      'Adams, Zed',
      'baker, Bo',
      'Fontaine, Joe',
      'Fontaine, Joe, Jr',
      'Fontaine, Joe, Sr',
    ])
  })

  it('by name shows a blank lane for a bowler with none', () => {
    const page = createLanePage({ unassigned: [bowler('Amy', 'Adams')] })

    expect(buildCheckIn(page, 'name')[0]?.rows[0]?.lane).toBe('')
  })

  it('by lane keeps the pairs in order with their seats, skips empty pairs, and ends with no lane', () => {
    const page = createLanePage({
      pairs: [
        createLanePair(1, [bowler('Al', 'Lee', '', '1A'), bowler('Bo', 'Kim', '', '1B')]),
        createLanePair(3, []),
        createLanePair(5, [bowler('Cy', 'Poe', 'III', '5A')]),
      ],
      unassigned: [bowler('Zed', 'Young'), bowler('Amy', 'Young')],
      other: [bowler('Dee', 'Oak', '', 'X')],
    })

    const groups = buildCheckIn(page, 'lane')

    expect(groups.map((group) => group.heading)).toEqual([
      'Lanes 1-2',
      'Lanes 5-6',
      'Other positions',
      'No lane',
    ])
    expect(groups[0]?.rows.map((row) => row.lane)).toEqual(['1A', '1B'])
    expect(names(groups[1]?.rows ?? [])).toEqual(['Poe, Cy, III'])
    expect(names(groups[3]?.rows ?? [])).toEqual(['Young, Amy', 'Young, Zed'])
  })

  it('names a one-lane pair "Lane 5"', () => {
    const page = createLanePage({
      pairs: [{ ...createLanePair(5, [bowler('Al', 'Lee', '', '5A')]), lanes: [5] }],
    })

    expect(buildCheckIn(page, 'lane')[0]?.heading).toBe('Lane 5')
  })

  it('carries the division, average, and pins', () => {
    const page = createLanePage({
      unassigned: [
        createLaneBowler({ divisionName: 'Women', average: null, pins: 12, superSweeper: true }),
      ],
    })

    expect(buildCheckIn(page, 'name')[0]?.rows[0]).toMatchObject({
      divisionName: 'Women',
      average: null,
      pins: 12,
      superSweeper: true,
    })
  })
})
