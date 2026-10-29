import { describe, expect, it } from 'vitest'
import { createDivision, createLaneEntry } from '../../test/factories.ts'
import { buildLanePage, type LaneSession } from './lanePage.ts'
import { lanePageSchema } from './types.ts'

const division = createDivision({ number: 1, name: 'Open' })

function session(overrides: Partial<LaneSession> = {}): LaneSession {
  return {
    kind: 'squad',
    id: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
    date: '2026-10-24T09:00:00',
    complete: false,
    startingLane: 1,
    numberOfLanes: 10,
    maxPerPair: 5,
    bonusPins: [],
    ...overrides,
  }
}

function entry(position: string, overrides: Parameters<typeof createLaneEntry>[0] = {}) {
  return createLaneEntry({ divisionId: division.id, position, ...overrides })
}

function positionsOf(page: ReturnType<typeof buildLanePage>['page'], pair: number) {
  return page.pairs[pair]?.bowlers.map((bowler) => bowler.position)
}

describe('buildLanePage', () => {
  it('puts a bowler in the pair that holds their lane (LAN-03)', () => {
    const { page } = buildLanePage(
      session(),
      [entry('1A'), entry('2C'), entry('4C'), entry('9A')],
      [division],
    )

    expect(positionsOf(page, 0)).toEqual(['1A', '2C'])
    expect(positionsOf(page, 1)).toEqual(['4C'])
    expect(positionsOf(page, 4)).toEqual(['9A'])
  })

  it('draws one pair per two lanes, each with its capacity (LAN-03, LAN-02)', () => {
    const { page } = buildLanePage(session({ startingLane: 11, maxPerPair: 3 }), [], [division])

    expect(
      page.pairs.map(({ firstLane, lanes, capacity }) => ({ firstLane, lanes, capacity })),
    ).toEqual(
      [11, 13, 15, 17, 19].map((firstLane) => ({
        firstLane,
        lanes: [firstLane, firstLane + 1],
        capacity: 3,
      })),
    )
  })

  it('sorts a pair by lane, then letter (LAN-04)', () => {
    const { page } = buildLanePage(
      session(),
      [entry('2D'), entry('2C'), entry('1B'), entry('1A'), entry('2E')],
      [division],
    )

    expect(positionsOf(page, 0)).toEqual(['1A', '1B', '2C', '2D', '2E'])
  })

  it('lists bowlers with no position as unassigned, sorted by name (LAN-10, D-58)', () => {
    const { page } = buildLanePage(
      session(),
      [
        entry('', { firstName: 'Zed', lastName: 'Adams', name: 'Zed Adams' }),
        entry('', { firstName: 'Amy', lastName: 'Adams', name: 'Amy Adams' }),
        entry('', { firstName: 'Bo', lastName: 'Zane', name: 'Bo Zane' }),
      ],
      [division],
    )

    expect(page.unassigned.map((bowler) => bowler.name)).toEqual([
      'Amy Adams',
      'Zed Adams',
      'Bo Zane',
    ])
    expect(page.pairs.every((pair) => pair.bowlers.length === 0)).toBe(true)
  })

  it.each([[['b', 'a', 'c']], [['c', 'b', 'a']], [['a', 'c', 'b']]])(
    'breaks a name tie by registration id: %j',
    (ids) => {
      const { page } = buildLanePage(
        session(),
        ids.map((registrationId) =>
          entry('', { firstName: 'Joe', lastName: 'Fontaine', registrationId }),
        ),
        [division],
      )

      expect(page.unassigned.map((bowler) => bowler.registrationId)).toEqual(['a', 'b', 'c'])
    },
  )

  it('sorts by last name, then first name, before the registration id', () => {
    const { page } = buildLanePage(
      session(),
      [
        entry('', { firstName: 'Bo', lastName: 'Zane', registrationId: 'a' }),
        entry('', { firstName: 'Zed', lastName: 'Adams', registrationId: 'b' }),
        entry('', { firstName: 'Amy', lastName: 'Adams', registrationId: 'c' }),
      ],
      [division],
    )

    expect(page.unassigned.map((bowler) => bowler.registrationId)).toEqual(['c', 'b', 'a'])
  })

  it('ignores case when it sorts names, so only the id breaks the tie', () => {
    const { page } = buildLanePage(
      session(),
      [
        entry('', { firstName: 'Joe', lastName: 'adams', registrationId: 'b' }),
        entry('', { firstName: 'Joe', lastName: 'Adams', registrationId: 'a' }),
      ],
      [division],
    )

    expect(page.unassigned.map((bowler) => bowler.registrationId)).toEqual(['a', 'b'])
  })

  it('shows a legacy 2B on its pair as stored (D-61)', () => {
    const { page, outsideLanes } = buildLanePage(
      session({ maxPerPair: 2 }),
      [entry('1A'), entry('2B')],
      [division],
    )

    expect(positionsOf(page, 0)).toEqual(['1A', '2B'])
    expect(outsideLanes).toEqual([])
  })

  it('shows a pair that holds more than maxPerPair, whole (D-61)', () => {
    const { page } = buildLanePage(
      session({ maxPerPair: 2 }),
      [entry('1A'), entry('1B'), entry('2C')],
      [division],
    )

    expect(positionsOf(page, 0)).toEqual(['1A', '1B', '2C'])
    expect(page.pairs[0]?.capacity).toBe(2)
  })

  it.each([
    ['a lane outside the session', '31A'],
    ['a letter past E', '1F'],
    ['text that is not a position', 'xyz'],
    ['lane 0', '0A'],
  ])('lists %s under other, with the raw text (D-61)', (_name, position) => {
    const lost = entry(position)

    const { page, outsideLanes } = buildLanePage(session(), [entry('1A'), lost], [division])

    expect(page.other.map((bowler) => bowler.position)).toEqual([position])
    expect(outsideLanes).toEqual([lost.registrationId])
    expect(positionsOf(page, 0)).toEqual(['1A'])
  })

  it('sorts other positions by their text', () => {
    const { page } = buildLanePage(session(), [entry('31A'), entry('15Z'), entry('2Q')], [division])

    expect(page.other.map((bowler) => bowler.position)).toEqual(['15Z', '2Q', '31A'])
  })

  it('has no pairs when the session has no lanes, so a stored position goes to other (LAN-03)', () => {
    const { page } = buildLanePage(
      session({ startingLane: 0, numberOfLanes: 0 }),
      [entry('1A'), entry('')],
      [division],
    )

    expect(page.pairs).toEqual([])
    expect(page.other).toHaveLength(1)
    expect(page.unassigned).toHaveLength(1)
  })

  it('gives a squad bowler their handicap as pins (LAN-11, SCR-07)', () => {
    const handicapped = createDivision({
      number: 2,
      handicapBase: 220,
      handicapPercentage: 90,
      maximumHandicapPerGame: 50,
    })

    const { page } = buildLanePage(
      session(),
      [entry('', { divisionId: handicapped.id, average: 200 })],
      [handicapped],
    )

    expect(page.unassigned[0]?.pins).toBe(18)
  })

  it('gives a sweeper bowler the division bonus pins, or 0 when it has none (LAN-11, SCR-09)', () => {
    const second = createDivision({ number: 2, name: 'Women/Senior' })
    const { page } = buildLanePage(
      session({
        kind: 'sweeper',
        bonusPins: [{ divisionId: second.id, divisionName: second.name, bonusPinsPerGame: 10 }],
      }),
      [
        entry('', { divisionId: second.id, lastName: 'A' }),
        entry('', { divisionId: division.id, lastName: 'B' }),
      ],
      [division, second],
    )

    expect(page.unassigned.map((bowler) => bowler.pins)).toEqual([10, 0])
  })

  it('carries the average, the super sweeper flag, the position, and the division name (LAN-11)', () => {
    const { page } = buildLanePage(
      session({ kind: 'sweeper' }),
      [entry('3A', { average: null, superSweeper: true, firstName: 'Joe', lastName: 'Fontaine' })],
      [division],
    )

    expect(page.pairs[1]?.bowlers[0]).toMatchObject({
      average: null,
      superSweeper: true,
      position: '3A',
      divisionName: 'Open',
      divisionId: division.id,
      firstName: 'Joe',
      lastName: 'Fontaine',
    })
  })

  it('counts entries per division, listing 0, in division order (LAN-10)', () => {
    const second = createDivision({ number: 2, name: 'Scratch' })
    const third = createDivision({ number: 3, name: 'Women' })

    const { page } = buildLanePage(
      session(),
      [entry('1A'), entry(''), entry('99Z'), entry('', { divisionId: second.id })],
      [third, second, division],
    )

    expect(page.divisions).toEqual([
      { id: division.id, number: 1, name: 'Open', entries: 3 },
      { id: second.id, number: 2, name: 'Scratch', entries: 1 },
      { id: third.id, number: 3, name: 'Women', entries: 0 },
    ])
  })

  it('breaks a division number tie by name', () => {
    const b = createDivision({ number: 1, name: 'B' })
    const a = createDivision({ number: 1, name: 'A' })

    const { page } = buildLanePage(session(), [], [b, a])

    expect(page.divisions.map((item) => item.name)).toEqual(['A', 'B'])
  })

  it('skips an entry whose division is not the tournaments, and says so (D-51)', () => {
    const stray = entry('1A', { divisionId: '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01' })

    const { page, skipped } = buildLanePage(session(), [stray, entry('2C')], [division])

    expect(skipped).toEqual([stray.registrationId])
    expect(positionsOf(page, 0)).toEqual(['2C'])
    expect(page.divisions[0]?.entries).toBe(1)
  })

  it('describes the session (LAN-13)', () => {
    const { page } = buildLanePage(session({ complete: true, kind: 'sweeper' }), [], [division])

    expect(page.session).toEqual({
      id: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
      kind: 'sweeper',
      date: '2026-10-24T09:00:00',
      complete: true,
      startingLane: 1,
      numberOfLanes: 10,
      maxPerPair: 5,
    })
  })

  it('builds a page that fits the response schema', () => {
    const { page } = buildLanePage(session(), [entry('1A'), entry(''), entry('99Z')], [division])

    expect(lanePageSchema.safeParse(page).success).toBe(true)
  })
})
