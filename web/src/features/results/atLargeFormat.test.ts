import { describe, expect, it } from 'vitest'
import { createLiveAtLarge } from '../../mocks/data'
import { formatAtLarge, formatAtLargeChange } from './format'

const line = { total: 887, games: 4, highGame: 242, tieBreaker: null, fullTie: false }

describe('formatAtLarge (RES-58, RES-60)', () => {
  it.each([
    [{}, 'At Large: +87 (HG 242) | 4 Spots'],
    [{ spots: 1 }, 'At Large: +87 (HG 242) | 1 Spot'],
    [{ handicap: true }, 'At Large: +87 (HG 242 w/HDCP) | 4 Spots'],
    [{ projected: true }, 'Projected At Large: +87 (HG 242) | 4 Spots'],
    [{ spots: 0, line: null }, 'At Large: no spots yet'],
    [{ spots: 0, line: null, projected: true }, 'Projected At Large: no spots yet'],
    [{ line: null }, 'At Large: 4 Spots'],
    [{ line: { ...line, fullTie: true } }, 'At Large: +87 (full tie) | 4 Spots'],
    [
      { line: { ...line, tieBreaker: { rank: 2, score: 230 } } },
      'At Large: +87 (HG 242, 2nd 230) | 4 Spots',
    ],
    [
      { handicap: true, line: { ...line, tieBreaker: { rank: 3, score: 210 } } },
      'At Large: +87 (HG 242 w/HDCP, 3rd 210 scratch) | 4 Spots',
    ],
  ])('says %o as "%s"', (over, expected) => {
    expect(formatAtLarge(createLiveAtLarge(over))).toBe(expected)
  })

  it.each([
    [{ spots: 6 }, 5, 'Open: Projected At Large: +87 (HG 242) | 6 Spots (was 5)'],
    [{ spots: 1 }, 0, 'Open: Projected At Large: +87 (HG 242) | 1 Spot (was none)'],
    [{ spots: 0, line: null }, 1, 'Open: Projected At Large: No Spots (was 1)'],
  ])('words a change of spots (RES-62)', (over, was, expected) => {
    expect(formatAtLargeChange(createLiveAtLarge(over), was)).toBe(expected)
  })
})
