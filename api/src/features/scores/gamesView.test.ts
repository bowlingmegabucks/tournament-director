import { describe, expect, it } from 'vitest'
import { createDivision, createLaneEntry } from '../../test/factories.ts'
import { buildLanePage, type LaneSession } from '../lanes/lanePage.ts'
import type { Skip } from '../skip/store.ts'
import { buildGamesView } from './gamesView.ts'
import { gamesViewSchema } from './gamesTypes.ts'
import type { ScoreRow } from './types.ts'

const open = createDivision({ number: 1, name: 'Open' })

const session: LaneSession = {
  kind: 'squad',
  id: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
  date: '2026-10-24T09:00:00',
  complete: false,
  startingLane: 1,
  numberOfLanes: 4,
  maxPerPair: 4,
  bonusPins: [],
}

// Four bowlers, one on each lane of two pairs. With 4 lanes in use the skip is 0, so the staggered
// cross of the bowler who starts on lane 1 is 1, 4, 3 and the same cross is 1, 4, 1 (LAN-19).
const ann = createLaneEntry({ divisionId: open.id, position: '1A', name: 'Ann Lee' })
const bea = createLaneEntry({ divisionId: open.id, position: '2A', name: 'Bea Moss' })
const cal = createLaneEntry({ divisionId: open.id, position: '3A', name: 'Cal Ode' })
const dee = createLaneEntry({ divisionId: open.id, position: '4A', name: 'Dee Park' })
const late = createLaneEntry({ divisionId: open.id, position: '', name: 'Lou Late' })

function view(
  options: {
    skip?: Skip
    scores?: ScoreRow[]
    games?: number
    extra?: (typeof ann)[]
    flagged?: Set<string>
  } = {},
) {
  const entries = [ann, bea, cal, dee, late, ...(options.extra ?? [])]
  const { page } = buildLanePage(session, entries, [open])
  return buildGamesView(
    page,
    entries,
    options.scores ?? [],
    options.games ?? 3,
    options.skip ?? 'staggered',
    options.flagged,
  )
}

const labels = (built: ReturnType<typeof view>, game: number) =>
  built.games[game - 1]?.pairs.map((pair) => ({
    lanes: pair.lanes,
    bowlers: pair.bowlers.map((bowler) => `${bowler.lane} ${bowler.name}`),
  }))

describe('buildGamesView and the DNF flag (SCR-24)', () => {
  it('marks a flagged bowler and no one else', () => {
    const built = view({ flagged: new Set([ann.registrationId, 'someone-else']) })

    const bowlers = built.games.flatMap((game) => game.pairs.flatMap((pair) => pair.bowlers))
    const flagged = bowlers.filter((bowler) => bowler.dnf)
    expect(flagged.map((bowler) => bowler.name)).toEqual(['Ann Lee', 'Ann Lee', 'Ann Lee'])
  })

  it('marks nobody without flags', () => {
    const bowlers = view().games.flatMap((game) => game.pairs.flatMap((pair) => pair.bowlers))
    expect(bowlers.some((bowler) => bowler.dnf)).toBe(false)
    expect(gamesViewSchema.safeParse(view()).success).toBe(true)
  })
})

describe('buildGamesView', () => {
  it('lists every game with the pairs as bowled in that game (SCR-22, D-234)', () => {
    const built = view()

    expect(built.games.map((game) => game.game)).toEqual([1, 2, 3])
    expect(labels(built, 1)).toEqual([
      { lanes: [1, 2], bowlers: ['1A Ann Lee', '2A Bea Moss'] },
      { lanes: [3, 4], bowlers: ['3A Cal Ode', '4A Dee Park'] },
    ])
  })

  it('puts bowlers from other starting pairs together in a later game (LAN-19, D-230)', () => {
    // Game 2: Ann goes to 4A, Bea to 3A, Cal to 2A, Dee to 1A.
    expect(labels(view(), 2)).toEqual([
      { lanes: [1, 2], bowlers: ['1A Dee Park', '2A Cal Ode'] },
      { lanes: [3, 4], bowlers: ['3A Bea Moss', '4A Ann Lee'] },
    ])
  })

  it('follows the stored skip: staggered and same give different lanes in game 3 (LAN-19, D-235)', () => {
    const lane = (skip: Skip) =>
      view({ skip })
        .games[2]?.pairs.flatMap((pair) => pair.bowlers)
        .find((bowler) => bowler.name === 'Ann Lee')?.lane
    expect(lane('staggered')).toBe('3A')
    expect(lane('same')).toBe('1A')
    expect(view({ skip: 'same' }).skip).toBe('same')
  })

  it('shows each bowler their own score for the game and all their scores (SCR-22)', () => {
    const scores: ScoreRow[] = [
      { bowlerId: ann.bowlerId, game: 1, score: 200 },
      { bowlerId: ann.bowlerId, game: 2, score: 0 },
      { bowlerId: bea.bowlerId, game: 1, score: 180 },
    ]
    const built = view({ scores })

    const ann2 = built.games[1]?.pairs
      .flatMap((pair) => pair.bowlers)
      .find((b) => b.name === 'Ann Lee')
    expect(ann2).toMatchObject({ score: 0, scores: [200, 0, null], total: 200 })
    const bea2 = built.games[1]?.pairs
      .flatMap((pair) => pair.bowlers)
      .find((b) => b.name === 'Bea Moss')
    expect(bea2).toMatchObject({ score: null, scores: [180, null, null], total: 180 })
  })

  it('counts the bowlers with a score for each game, a stored 0 included (SCR-22)', () => {
    const scores: ScoreRow[] = [
      { bowlerId: ann.bowlerId, game: 1, score: 200 },
      { bowlerId: bea.bowlerId, game: 1, score: 0 },
      { bowlerId: cal.bowlerId, game: 2, score: 190 },
    ]
    const built = view({ scores })
    expect(built.games.map(({ entered, total }) => ({ entered, total }))).toEqual([
      { entered: 2, total: 4 },
      { entered: 1, total: 4 },
      { entered: 0, total: 4 },
    ])
  })

  it('has exactly `games` games and ignores a stored game above the count (D-238)', () => {
    const scores: ScoreRow[] = [
      { bowlerId: ann.bowlerId, game: 4, score: 250 },
      { bowlerId: ann.bowlerId, game: 1, score: 100 },
    ]
    const built = view({ scores })
    expect(built.games).toHaveLength(3)
    expect(built.session.games).toBe(3)
    const ann1 = built.games[0]?.pairs
      .flatMap((pair) => pair.bowlers)
      .find((b) => b.name === 'Ann Lee')
    expect(ann1?.scores).toEqual([100, null, null])
    expect(ann1?.total).toBe(100)
  })

  it('ignores a score for a bowler who is not entered (SCR-16)', () => {
    const built = view({ scores: [{ bowlerId: 'stranger', game: 1, score: 300 }] })
    expect(built.games[0]?.entered).toBe(0)
  })

  it('counts bowlers with no lane and with a position outside the lanes, and lists neither (D-71)', () => {
    const lost = createLaneEntry({ divisionId: open.id, position: '77A', name: 'Lost Lena' })
    const built = view({ extra: [lost] })
    expect(built.withoutLane).toBe(2)
    const names = built.games.flatMap((game) =>
      game.pairs.flatMap((pair) => pair.bowlers.map((b) => b.name)),
    )
    expect(names).not.toContain('Lou Late')
  })

  it('sorts bowlers of a pair by lane, then letter (LAN-04)', () => {
    const entries = [
      createLaneEntry({ divisionId: open.id, position: '1B', name: 'Second B' }),
      createLaneEntry({ divisionId: open.id, position: '2A', name: 'Third' }),
      createLaneEntry({ divisionId: open.id, position: '1A', name: 'First A' }),
    ]
    const { page } = buildLanePage(session, entries, [open])
    const built = buildGamesView(page, entries, [], 1, 'staggered')
    expect(built.games[0]?.pairs[0]?.bowlers.map((bowler) => bowler.lane)).toEqual([
      '1A',
      '1B',
      '2A',
    ])
  })

  it('lists a one game session with one game (SCR-22)', () => {
    expect(view({ games: 1 }).games).toHaveLength(1)
  })

  it('matches the schema and sends none of the private fields (BWL-17, SCR-22)', () => {
    const built = view()
    expect(gamesViewSchema.safeParse(built).success).toBe(true)
    const text = JSON.stringify(built)
    for (const word of ['average', 'ssn', 'gender', 'email', 'phone', 'birth']) {
      expect(text.toLowerCase()).not.toContain(word)
    }
  })

  it('leaves out a game with no bowlers when nobody has a lane (D-71)', () => {
    const entries = [late]
    const { page } = buildLanePage(session, entries, [open])
    const built = buildGamesView(page, entries, [], 3, 'staggered')
    expect(built.games.map((game) => game.pairs)).toEqual([[], [], []])
    expect(built.withoutLane).toBe(1)
  })
})
