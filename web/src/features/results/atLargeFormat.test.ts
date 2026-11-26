import { describe, expect, it } from 'vitest'
import { createLiveAtLarge } from '../../mocks/data'
import { formatAtLarge, formatAtLargeChange } from './format'

const line = { total: 887, games: 4, highGame: 242, tieBreaker: null, fullTie: false }

describe('formatAtLarge (RES-58, RES-60)', () => {
  it.each([
    [{}, 'At Large: 4 spots - +87 HG 242'],
    [{ spots: 1 }, 'At Large: 1 spot - +87 HG 242'],
    [{ handicap: true }, 'At Large: 4 spots - +87 HG 242 w/HDCP'],
    [{ projected: true }, 'Projected At Large: 4 spots - +87 HG 242'],
    [{ spots: 0, line: null }, 'At Large: no spots yet'],
    [{ spots: 0, line: null, projected: true }, 'Projected At Large: no spots yet'],
    [{ line: null }, 'At Large: 4 spots'],
    [{ line: { ...line, fullTie: true } }, 'At Large: 4 spots - +87 full tie'],
    [
      { line: { ...line, tieBreaker: { rank: 2, score: 230 } } },
      'At Large: 4 spots - +87 HG 242, 2nd 230',
    ],
    [
      { handicap: true, line: { ...line, tieBreaker: { rank: 3, score: 210 } } },
      'At Large: 4 spots - +87 HG 242 w/HDCP, 3rd 210 scratch',
    ],
  ])('says %o as "%s"', (over, expected) => {
    expect(formatAtLarge(createLiveAtLarge(over))).toBe(expected)
  })

  it.each([
    [{ spots: 6 }, 5, 'Open: projected At Large now 6 spots (was 5) - +87 HG 242'],
    [{ spots: 1 }, 0, 'Open: projected At Large now 1 spot (was none) - +87 HG 242'],
    [{ spots: 0, line: null }, 1, 'Open: projected At Large now no spots (was 1)'],
  ])('words a change of spots (RES-62)', (over, was, expected) => {
    expect(formatAtLargeChange(createLiveAtLarge(over), was)).toBe(expected)
  })
})
