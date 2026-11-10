import { describe, expect, it } from 'vitest'
import { createLaneBowler, createLanePage, createLanePair } from '../../mocks/data'
import { describeChange, diffPages } from './pageDiff'

const at = (position: string, registrationId = position) =>
  createLaneBowler({ registrationId, position })

const pageOf = (
  pairs: ReturnType<typeof createLanePair>[],
  unassigned = [] as ReturnType<typeof at>[],
) => createLanePage({ pairs, unassigned })

describe('diffPages (LAN-21)', () => {
  const base = pageOf(
    [createLanePair(1, [at('1A')]), createLanePair(3, [at('3A')])],
    [at('', 'u1')],
  )

  it('finds no change between two reads of the same page', () => {
    expect(diffPages(base, structuredClone(base))).toEqual({ pairs: [], unassigned: false })
  })

  it('finds a bowler who left one pair and joined another, and the unassigned list they left', () => {
    const after = pageOf([createLanePair(1, []), createLanePair(3, [at('3A'), at('3C', 'u1')])], [])

    expect(diffPages(base, after)).toEqual({
      pairs: [1, 3],
      unassigned: true,
    })
  })

  it('finds a bowler who took a different seat in the same pair', () => {
    const after = pageOf(
      [createLanePair(1, [at('2C', '1A')]), createLanePair(3, [at('3A')])],
      [at('', 'u1')],
    )
    expect(diffPages(base, after)).toEqual({ pairs: [1], unassigned: false })
  })

  it('finds a new bowler in the unassigned list only', () => {
    const after = pageOf(base.pairs, [at('', 'u1'), at('', 'u2')])
    expect(diffPages(base, after)).toEqual({ pairs: [], unassigned: true })
  })

  it('finds a pair that was not on the page before', () => {
    const after = pageOf([...base.pairs, createLanePair(5, [at('5A')])], [at('', 'u1')])
    expect(diffPages(base, after)).toEqual({ pairs: [5], unassigned: false })
  })
})

describe('describeChange (LAN-21)', () => {
  const page = pageOf([createLanePair(5, []), createLanePair(7, []), createLanePair(9, [])])

  it('names one pair', () => {
    expect(describeChange(page, { pairs: [5], unassigned: false })).toBe('Updated: lanes 5-6')
  })

  it('names several pairs in page order, and the unassigned list last', () => {
    expect(describeChange(page, { pairs: [9, 5], unassigned: true })).toBe(
      'Updated: lanes 5-6, lanes 9-10, unassigned list',
    )
  })

  it('names the unassigned list alone', () => {
    expect(describeChange(page, { pairs: [], unassigned: true })).toBe('Updated: unassigned list')
  })

  it('says a one-lane pair in the singular', () => {
    const odd = pageOf([{ ...createLanePair(7, []), lanes: [7] }])
    expect(describeChange(odd, { pairs: [7], unassigned: false })).toBe('Updated: lane 7')
  })

  it('says nothing when nothing changed', () => {
    expect(describeChange(page, { pairs: [], unassigned: false })).toBeUndefined()
  })
})
