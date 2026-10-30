import { describe, expect, it } from 'vitest'
import { createDivision, createLaneEntry } from '../../test/factories.ts'
import { buildLanePage, type LaneSession } from '../lanes/lanePage.ts'
import { buildRecapSheets } from './recapSheets.ts'
import { recapSheetsSchema } from './types.ts'

const division = createDivision({ number: 1, name: 'Open' })

function session(overrides: Partial<LaneSession> = {}): LaneSession {
  return {
    kind: 'squad',
    id: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
    date: '2026-10-24T09:00:00',
    complete: false,
    startingLane: 1,
    numberOfLanes: 16,
    maxPerPair: 4,
    bonusPins: [],
    ...overrides,
  }
}

function sheetsFor(
  positions: string[],
  options: { games?: number; session?: LaneSession; handicapped?: boolean } = {},
) {
  const open = options.handicapped
    ? createDivision({ number: 1, name: 'Open', handicapBase: 220, handicapPercentage: 90 })
    : division
  const entries = positions.map((position) => createLaneEntry({ divisionId: open.id, position }))
  const { page, skipped } = buildLanePage(options.session ?? session(), entries, [open])
  return { built: buildRecapSheets(page, options.games ?? 6, skipped.length), entries }
}

describe('buildRecapSheets', () => {
  it('makes one sheet for each bowler with a saved lane (RPT-05c)', () => {
    const { built } = sheetsFor(['1A', '2C', '', '5A'])

    expect(built.sheets).toHaveLength(3)
    expect(built.sheets.map((sheet) => sheet.position)).toEqual(['1A', '2C', '5A'])
    expect(recapSheetsSchema.safeParse(built).success).toBe(true)
  })

  it('orders the sheets by lane, then letter (RPT-05b, LAN-04)', () => {
    const { built } = sheetsFor(['5A', '2C', '1B', '1A'])

    expect(built.sheets.map((sheet) => sheet.position)).toEqual(['1A', '1B', '2C', '5A'])
  })

  it('counts bowlers with no lane, or a lane outside the session, as without a sheet (D-61, D-65)', () => {
    const { built } = sheetsFor(['1A', '', '', '99A', '1F'])

    expect(built.sheets).toHaveLength(1)
    expect(built.withoutLane).toBe(4)
  })

  it('gives no sheets and a zero count when no one has entered (RPT-05c)', () => {
    expect(sheetsFor([]).built).toMatchObject({ sheets: [], withoutLane: 0, withoutDivision: 0 })
  })

  it('counts a bowler with a lane but an unknown division apart, with no sheet (D-51, D-65)', () => {
    const known = createLaneEntry({ divisionId: division.id, position: '1A' })
    const stranger = createLaneEntry({ position: '3A' })
    const { page, skipped } = buildLanePage(session(), [known, stranger], [division])

    const built = buildRecapSheets(page, 3, skipped.length)

    expect(built.sheets.map((sheet) => sheet.registrationId)).toEqual([known.registrationId])
    expect(built.withoutDivision).toBe(1)
    expect(built.withoutLane).toBe(0)
    // The stranger's pair is not in use, so the cross runs over lanes 1 and 2 only.
    expect(built.sheets[0]?.cross.same).toEqual(['1A', '2A', '1A'])
  })

  it('works each cross from the lanes in use across the whole session (LAN-18, D-64)', () => {
    // Pairs 1-2 and 3-4 hold bowlers, so lanes 1 to 4 are in use. Skip 0, same pattern: the
    // bowler on 1A walks 1, 3, 1 and swaps on game 2: 1A 4A 1A.
    const { built } = sheetsFor(['1A', '3A'], { games: 3 })

    expect(built.sheets[0]?.cross.same).toEqual(['1A', '4A', '1A'])
  })

  it('changes a cross when another bowler adds a pair to the lanes in use (LAN-18)', () => {
    const alone = sheetsFor(['1A'], { games: 3 }).built.sheets[0]
    const together = sheetsFor(['1A', '3A', '5A'], { games: 3 }).built.sheets[0]

    expect(alone?.cross.same).not.toEqual(together?.cross.same)
    expect(together?.cross.same).toEqual(['1A', '4A', '5A'])
  })

  it('sends a cross for each pattern, one lane label per game (RPT-05a, LAN-19)', () => {
    const { built } = sheetsFor(['1A', '3A', '5A', '7A', '9A', '11A', '13A', '15A'], { games: 6 })
    const first = built.sheets[0]

    expect(first?.cross.same).toEqual(['1A', '4A', '5A', '8A', '9A', '12A'])
    expect(first?.cross.staggered).toEqual(['1A', '4A', '7A', '10A', '11A', '14A'])
  })

  it('keeps each bowler letter on every game (LAN-19)', () => {
    const { built } = sheetsFor(['2B', '15C'], { games: 4 })

    expect(built.sheets[0]?.cross.same.every((lane) => lane.endsWith('B'))).toBe(true)
    expect(built.sheets[1]?.cross.same.every((lane) => lane.endsWith('C'))).toBe(true)
  })

  it('sends the handicap on a squad and the bonus pins on a sweeper (SCR-07, SCR-09)', () => {
    const squad = sheetsFor(['1A'], { handicapped: true }).built.sheets[0]
    expect(squad?.handicap).toBe(18)

    const sweeper = session({
      kind: 'sweeper',
      bonusPins: [{ divisionId: division.id, divisionName: 'Open', bonusPinsPerGame: 12 }],
    })
    expect(sheetsFor(['1A'], { session: sweeper }).built.sheets[0]?.handicap).toBe(12)
  })

  it('carries the session facts the sheet prints (RPT-05)', () => {
    const { built } = sheetsFor(['1A'], { games: 4, session: session({ complete: true }) })

    expect(built.session).toEqual({
      id: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
      kind: 'squad',
      date: '2026-10-24T09:00:00',
      games: 4,
      complete: true,
    })
  })

  it('sends the name and the division name (RPT-05)', () => {
    const { built, entries } = sheetsFor(['1A'])

    expect(built.sheets[0]).toMatchObject({
      registrationId: entries[0]?.registrationId,
      name: entries[0]?.name,
      divisionName: 'Open',
    })
  })

  it('never sends fields beyond the sheet (BWL-17)', () => {
    const { built } = sheetsFor(['1A'])

    expect(Object.keys(built.sheets[0] ?? {}).toSorted()).toEqual([
      'cross',
      'divisionName',
      'handicap',
      'name',
      'position',
      'registrationId',
    ])
  })
})
