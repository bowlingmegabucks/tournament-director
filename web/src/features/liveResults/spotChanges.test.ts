import { describe, expect, it } from 'vitest'
import { createLiveAtLarge, createLiveResults } from '../../mocks/data'
import { AT_LARGE_NOTICE_MS, spotChanges } from './liveLogic'

const divisionId = '44444444-4444-4444-8444-444444444444'
const feed = (spots: number, projected = true) =>
  createLiveResults({ atLarge: [createLiveAtLarge({ divisionId, spots, projected })] })

describe('spotChanges (RES-62)', () => {
  it.each([
    [5, 6],
    [6, 5],
  ])('reports projected spots going from %i to %i', (was, now) => {
    expect(spotChanges(feed(was), feed(now))).toEqual([
      {
        divisionId,
        text: `Open: Projected At Large: +87 (HG 242) | ${now} Spots (was ${was})`,
        announcement: {
          variant: 'at-large',
          kicker: `Projected At Large · now ${now} Spots (was ${was})`,
          title: 'Open: +87 (HG 242)',
          game: now,
          duration: AT_LARGE_NOTICE_MS,
        },
      },
    ])
  })

  it('says nothing on the first load or for the same count', () => {
    expect(spotChanges(undefined, feed(6))).toEqual([])
    expect(spotChanges(feed(6), feed(6))).toEqual([])
  })

  it('says nothing on the move into or out of projected', () => {
    expect(spotChanges(feed(5, false), feed(6))).toEqual([])
    expect(spotChanges(feed(5), feed(6, false))).toEqual([])
    expect(spotChanges(createLiveResults(), feed(6))).toEqual([])
  })

  it('counts a division the older answer did not hold as no spot', () => {
    const other = createLiveAtLarge({ divisionName: 'Senior', spots: 1, projected: true })
    const after = createLiveResults({ atLarge: [...feed(5).atLarge, other] })

    expect(spotChanges(feed(5), after).map((change) => change.divisionId)).toEqual([
      other.divisionId,
    ])
  })

  it('words one spot that was none before', () => {
    const none = createLiveResults({
      atLarge: [createLiveAtLarge({ divisionId, spots: 0, projected: true, line: null })],
    })

    expect(spotChanges(none, feed(1))[0]?.announcement.kicker).toBe(
      'Projected At Large · now 1 Spot (was none)',
    )
  })

  it('words a change down to no spot', () => {
    const after = createLiveResults({
      atLarge: [createLiveAtLarge({ divisionId, spots: 0, projected: true, line: null })],
    })

    expect(spotChanges(feed(1), after)[0]?.announcement).toMatchObject({
      kicker: 'Projected At Large · now No Spots (was 1)',
      title: 'Open',
      game: 0,
    })
  })
})
