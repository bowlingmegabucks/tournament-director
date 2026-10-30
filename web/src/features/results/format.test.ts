import { describe, expect, it } from 'vitest'
import { createDivisionResult, createSquadRow, createSweeperRow } from '../../mocks/data'
import {
  formatDecider,
  formatGamesOf,
  formatRatio,
  formatSummary,
  formatTie,
  ordinal,
  squadItems,
  sweeperItems,
} from './format'

const row = (group: 'advancer' | 'casher' | 'other') => createSquadRow({ group })
const labels = (items: ReturnType<typeof squadItems>) =>
  items.map((item) => (item.kind === 'line' ? item.label : item.row.group))

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [10, '10th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [101, '101st'],
    [111, '111th'],
  ])('writes %i as %s', (value, text) => {
    expect(ordinal(value)).toBe(text)
  })
})

describe('formatDecider (D-14)', () => {
  it('names the games bowled, the high game, and the Nth highest game', () => {
    expect(formatDecider({ kind: 'games' })).toBe('games bowled')
    expect(formatDecider({ kind: 'game', rank: 1 })).toBe('high game')
    expect(formatDecider({ kind: 'game', rank: 2 })).toBe('2nd-highest game')
    expect(formatDecider({ kind: 'game', rank: 3 })).toBe('3rd-highest game')
  })
})

describe('formatTie (D-14, D-16)', () => {
  it('says who won the spot and on what', () => {
    expect(formatTie({ line: 'cut', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } })).toBe(
      'Tied on total at the cut line. Won the spot on high game.',
    )
  })

  it('says who lost the spot and on what', () => {
    expect(formatTie({ line: 'cash', outcome: 'lost', decidedBy: { kind: 'game', rank: 2 } })).toBe(
      'Tied on total at the cash line. Lost the spot on 2nd-highest game.',
    )
  })

  it('names the games bowled', () => {
    expect(formatTie({ line: 'cut', outcome: 'won', decidedBy: { kind: 'games' } })).toBe(
      'Tied on total at the cut line. Won the spot on games bowled.',
    )
  })

  it('says the director decides a full tie', () => {
    expect(formatTie({ line: 'cut', outcome: 'full', decidedBy: null })).toBe(
      'Full tie at the cut line. The director decides.',
    )
    expect(formatTie({ line: 'cash', outcome: 'full', decidedBy: null })).toBe(
      'Full tie at the cash line. The director decides.',
    )
  })

  it('treats a win with no tie-breaker as a full tie', () => {
    expect(formatTie({ line: 'cut', outcome: 'won', decidedBy: null })).toBe(
      'Full tie at the cut line. The director decides.',
    )
  })
})

describe('squadItems (RES-11)', () => {
  it('puts the cut line after the advancers and the cash line after the cashers', () => {
    const items = squadItems([
      row('advancer'),
      row('advancer'),
      row('casher'),
      row('other'),
      row('other'),
    ])

    expect(labels(items)).toEqual([
      'advancer',
      'advancer',
      'Cut Line',
      'casher',
      'Cash Line',
      'other',
      'other',
    ])
  })

  it('says "No Advancers" first when no one advances', () => {
    expect(labels(squadItems([row('casher'), row('other')]))).toEqual([
      'No Advancers',
      'casher',
      'Cash Line',
      'other',
    ])
  })

  it('has only a cut line when no one cashes beyond the advancers', () => {
    expect(labels(squadItems([row('advancer'), row('other')]))).toEqual([
      'advancer',
      'Cut Line',
      'other',
    ])
  })

  it('keeps both lines when the lists end there', () => {
    expect(labels(squadItems([row('advancer'), row('casher')]))).toEqual([
      'advancer',
      'Cut Line',
      'casher',
      'Cash Line',
    ])
  })

  it('has no lines and no rows for an empty list', () => {
    expect(squadItems([])).toEqual([])
  })

  it('draws a line after the last casher when cashers are not next to each other in order', () => {
    expect(
      labels(squadItems([row('advancer'), row('casher'), row('casher'), row('other')])),
    ).toEqual(['advancer', 'Cut Line', 'casher', 'casher', 'Cash Line', 'other'])
  })
})

describe('sweeperItems (RES-25a)', () => {
  it('puts the cash line after the last casher', () => {
    const items = sweeperItems([
      createSweeperRow({ group: 'casher' }),
      createSweeperRow({ group: 'casher' }),
      createSweeperRow({ group: 'other' }),
    ])

    expect(items.map((item) => (item.kind === 'line' ? item.label : item.row.group))).toEqual([
      'casher',
      'casher',
      'Cash Line',
      'other',
    ])
  })

  it('has no line when no one cashes', () => {
    expect(sweeperItems([createSweeperRow({ group: 'other' })])).toHaveLength(1)
  })
})

describe('summaries', () => {
  it('counts the entries, advancers, and cashers', () => {
    const division = createDivisionResult({
      entries: 16,
      rows: [row('advancer'), row('advancer'), row('casher'), row('other')],
    })

    expect(formatSummary(division)).toBe('16 entries · Advancing 2 · Cashing 1')
  })

  it('says "1 entry" for one', () => {
    expect(formatSummary(createDivisionResult({ entries: 1 }))).toBe(
      '1 entry · Advancing 0 · Cashing 0',
    )
  })

  it('writes a ratio as "1 in N"', () => {
    expect(formatRatio(8)).toBe('1 in 8')
    expect(formatRatio(7.5)).toBe('1 in 7.5')
  })

  it('writes games as "2 of 3"', () => {
    expect(formatGamesOf(2, 3)).toBe('2 of 3')
  })
})
