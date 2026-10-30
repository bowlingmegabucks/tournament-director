import { describe, expect, it } from 'vitest'
import { createScoreBowler, createScorePage, createScorePair } from '../../mocks/data'
import { countListed, formatNoLane } from './format'

describe('formatNoLane', () => {
  it('says one bowler in the singular (D-71)', () => {
    expect(formatNoLane(1)).toBe('1 bowler has no lane.')
  })

  it.each([2, 3, 12])('says %i bowlers in the plural (D-71)', (count) => {
    expect(formatNoLane(count)).toBe(`${count} bowlers have no lane.`)
  })
})

describe('countListed', () => {
  it('counts the bowlers in pairs and in other positions, not those with no lane (D-71)', () => {
    const page = createScorePage({
      pairs: [
        createScorePair(1, [createScoreBowler(), createScoreBowler()]),
        createScorePair(3, [createScoreBowler()]),
      ],
      other: [createScoreBowler()],
      noLane: 5,
    })

    expect(countListed(page)).toBe(4)
  })

  it('is 0 for an empty page', () => {
    expect(countListed(createScorePage())).toBe(0)
  })
})
