import { describe, expect, it } from 'vitest'
import {
  createAtLargeDivision,
  createDivisionResult,
  createSeedingDivision,
  createSeedingRow,
  createSquadRow,
  createSuperSweeperRow,
  createSweeperRow,
} from '../../mocks/data'
import {
  formatAtLargeSummary,
  formatDecider,
  formatFlagNote,
  formatFlagTag,
  formatGamesOf,
  formatSeedingSummary,
  formatSummary,
  formatSweeperColumn,
  formatSweeperTotal,
  formatTie,
  ordinal,
  seedingItems,
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

  it('says a full tie is a full tie even if a tie-breaker is sent', () => {
    expect(formatTie({ line: 'cut', outcome: 'full', decidedBy: { kind: 'games' } })).toBe(
      'Full tie at the cut line. The director decides.',
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

  it('writes games as "2 of 3"', () => {
    expect(formatGamesOf(2, 3)).toBe('2 of 3')
  })
})

describe('formatTie on the at-large page (D-93)', () => {
  it('calls the cut line the last at-large spot, and leaves the cash line alone', () => {
    const won = { line: 'cut', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } } as const
    expect(formatTie(won, 'last at-large spot')).toBe(
      'Tied on total at the last at-large spot. Won the spot on high game.',
    )
    expect(formatTie({ ...won, line: 'cash' }, 'last at-large spot')).toBe(
      'Tied on total at the cash line. Won the spot on high game.',
    )
    expect(formatTie({ line: 'cut', outcome: 'full', decidedBy: null }, 'last at-large spot')).toBe(
      'Full tie at the last at-large spot. The director decides.',
    )
  })
})

describe('seedingItems (RES-20)', () => {
  const seed = (group: 'finalist' | 'other') => createSeedingRow({ group })

  it('puts a Cut Line after the last finalist', () => {
    const items = seedingItems([seed('finalist'), seed('finalist'), seed('other')])

    expect(items.map((item) => (item.kind === 'line' ? item.label : item.row.group))).toEqual([
      'finalist',
      'finalist',
      'Cut Line',
      'other',
    ])
  })

  it('puts the line last when everyone is a finalist, and omits it with no finalist', () => {
    expect(seedingItems([seed('finalist')]).map((item) => item.kind)).toEqual(['row', 'line'])
    expect(seedingItems([seed('other')]).map((item) => item.kind)).toEqual(['row'])
    expect(seedingItems([])).toEqual([])
  })
})

describe('at-large and seeding summaries (RES-12, RES-18)', () => {
  it('writes the entries, spots, and advancers', () => {
    const division = createAtLargeDivision({
      entries: 80,
      totalSpots: 10,
      squadAdvancers: 8,
      atLargeSpots: 2,
    })

    expect(formatAtLargeSummary(division, 8)).toBe(
      '80 entries · 10 finals spots (ratio 8) · 8 advanced from squads · 2 at-large spots',
    )
  })

  it('uses the singular for one of each', () => {
    const division = createAtLargeDivision({
      entries: 1,
      totalSpots: 1,
      squadAdvancers: 1,
      atLargeSpots: 1,
    })

    expect(formatAtLargeSummary(division, 1)).toBe(
      '1 entry · 1 finals spot (ratio 1) · 1 advanced from squads · 1 at-large spot',
    )
  })

  it('counts the finalists, how they got in, and the others', () => {
    const division = createSeedingDivision({
      finalists: 10,
      atLarge: 2,
      rows: Array.from({ length: 80 }, () => createSeedingRow()),
    })

    expect(formatSeedingSummary(division)).toBe(
      '10 finalists (8 from squads, 2 at-large) · 70 others',
    )
    expect(
      formatSeedingSummary(
        createSeedingDivision({
          finalists: 1,
          atLarge: 0,
          rows: [createSeedingRow(), createSeedingRow()],
        }),
      ),
    ).toBe('1 finalist (1 from squads, 0 at-large) · 1 other')
  })
})

describe('super sweeper formats (D-90)', () => {
  const sweepers = [
    { id: 's1', date: '2026-10-09T19:00:00', games: 3, complete: true },
    { id: 's2', date: '2026-10-10T19:00:00', games: 1, complete: true },
  ]

  it('heads a column with the weekday and the day', () => {
    expect(formatSweeperColumn(sweepers[0] as (typeof sweepers)[number])).toBe('Fri 10/9')
  })

  it('tags a missed and an unfinished sweeper', () => {
    expect(formatFlagTag({ kind: 'missed', sweeperId: 's1', gamesBowled: 0 })).toBe(
      'Missed a sweeper',
    )
    expect(formatFlagTag({ kind: 'unfinished', sweeperId: 's1', gamesBowled: 2 })).toBe(
      'Did not finish a sweeper',
    )
  })

  it('names the sweeper behind a tag', () => {
    expect(formatFlagNote({ kind: 'missed', sweeperId: 's1', gamesBowled: 0 }, sweepers)).toBe(
      'Missed the Fri 10/9 sweeper. Scored 0 for 3 games.',
    )
    expect(formatFlagNote({ kind: 'missed', sweeperId: 's2', gamesBowled: 0 }, sweepers)).toBe(
      'Missed the Sat 10/10 sweeper. Scored 0 for 1 game.',
    )
    expect(formatFlagNote({ kind: 'unfinished', sweeperId: 's1', gamesBowled: 2 }, sweepers)).toBe(
      'Fri 10/9 sweeper: 2 of 3 games. Scored 0 for the rest.',
    )
  })

  it('gives no note for a sweeper that is not in the list', () => {
    expect(formatFlagNote({ kind: 'missed', sweeperId: 'gone', gamesBowled: 0 }, sweepers)).toBe('')
  })

  it('writes a total, or a dash while the sweeper is open', () => {
    expect(formatSweeperTotal(712)).toBe('712')
    expect(formatSweeperTotal(0)).toBe('0')
    expect(formatSweeperTotal(null)).toBe('\u2013')
  })

  it('puts the cash line after the last casher, as a sweeper does', () => {
    const rows = [
      createSuperSweeperRow({ group: 'casher' }),
      createSuperSweeperRow({ group: 'other' }),
    ]

    expect(sweeperItems(rows).map((item) => (item.kind === 'line' ? item.label : 'row'))).toEqual([
      'row',
      'Cash Line',
      'row',
    ])
  })
})
