import { faker } from '@faker-js/faker'
import type { Division } from '../features/divisions/types'
import type { Game, GameBowler, GamePair, GamesView } from '../features/scores/gamesTypes'
import type { ScorePage } from '../features/scores/types'
import type { SkipPattern } from '../features/skip/api'
import type { SessionKind } from '../shared/session'
import { createDemoLanePage, createDemoRecapSheets, createDemoScorePage } from './data'

/** A bowler on a pair of lanes in one game. Override only what a test cares about. */
export function createGameBowler(overrides: Partial<GameBowler> = {}): GameBowler {
  const scores = overrides.scores ?? [null, null, null]
  return {
    registrationId: faker.string.uuid(),
    name: `${faker.person.firstName()} ${faker.person.lastName()}`,
    divisionName: 'Open',
    lane: '1A',
    score: null,
    scores,
    total: scores.reduce<number>((sum, score) => sum + (score ?? 0), 0),
    dnf: false,
    ...overrides,
  }
}

export function createGamePair(firstLane: number, bowlers: GameBowler[] = []): GamePair {
  return { firstLane, lanes: [firstLane, firstLane + 1], bowlers }
}

/** One game with the counts that follow from its pairs, unless a test sets them. */
export function createGame(
  game: number,
  pairs: GamePair[] = [],
  overrides: Partial<Game> = {},
): Game {
  const everyone = pairs.flatMap((pair) => pair.bowlers)
  return {
    game,
    entered: everyone.filter((bowler) => bowler.score !== null).length,
    // Bowlers expected to bowl it: not one flagged did not finish with no score (D-248).
    total: everyone.filter((bowler) => bowler.score !== null || !bowler.dnf).length,
    pairs,
    ...overrides,
  }
}

/** A games view: three games, none entered, unless a test sends them. */
export function createGamesView(overrides: Partial<GamesView> = {}): GamesView {
  return {
    session: {
      id: faker.string.uuid(),
      kind: 'squad',
      date: '2026-10-24T09:00:00',
      complete: false,
      games: 3,
      ...overrides.session,
    },
    skip: 'staggered',
    games: [createGame(1), createGame(2), createGame(3)],
    withoutLane: 0,
    ...overrides,
  }
}

/** The lane number in a label such as `13A`. */
const laneOf = (label: string) => Number.parseInt(label, 10)

/** Scores a keeper saved in the mock, by registration: they sit over the demo scores. */
export type SavedScores = ReadonlyMap<string, (number | null)[]>

/** The demo scores page with saved scores laid over it, for the mock `GET .../scores` (SCR-16). */
export function withSavedScores(page: ScorePage, saved: SavedScores | undefined): ScorePage {
  if (!saved || saved.size === 0) return page
  const lay = <T extends { registrationId: string; scores: (number | null)[]; total: number }>(
    bowler: T,
  ): T => {
    const scores = saved.get(bowler.registrationId)
    if (!scores) return bowler
    const row = Array.from({ length: page.session.games }, (_, game) => scores[game] ?? null)
    return { ...bowler, scores: row, total: row.reduce<number>((sum, s) => sum + (s ?? 0), 0) }
  }
  return {
    ...page,
    pairs: page.pairs.map((pair) => ({ ...pair, bowlers: pair.bowlers.map(lay) })),
    other: page.other.map(lay),
  }
}

/** Registration ids the mock keeps for each demo bowler of a session, so a save finds the bowler a read sent. */
const stableIds = new Map<string, string>()

/**
 * The demo scores page of a squad or sweeper with stable registration ids and the keeper's saved
 * scores laid over it (SCR-16, SCR-19). `createDemoScorePage` makes new ids on every call, which a
 * browser that saves a score and reads again cannot use.
 */
export function createDemoScoresWithSaves(
  kind: SessionKind,
  session: Parameters<typeof createDemoLanePage>[1],
  divisions: Division[],
  saved: SavedScores | undefined,
): ScorePage {
  const page = createDemoScorePage(kind, session, divisions)
  const remap = <T extends { registrationId: string; name: string }>(bowler: T): T => {
    const key = `${session.id}:${bowler.name}`
    const id = stableIds.get(key) ?? crypto.randomUUID()
    stableIds.set(key, id)
    return { ...bowler, registrationId: id }
  }
  return withSavedScores(
    {
      ...page,
      pairs: page.pairs.map((pair) => ({ ...pair, bowlers: pair.bowlers.map(remap) })),
      other: page.other.map(remap),
    },
    saved,
  )
}

/**
 * For the mock server: the games of a demo squad or sweeper (SCR-22). The lane of each bowler for
 * each game comes from the demo recap sheets, whose labels are made up (only the API works out the
 * real cross); the scores come from the demo scores page with the keeper's saves over them.
 */
export function createDemoGamesView(
  kind: SessionKind,
  session: Parameters<typeof createDemoLanePage>[1] & { games: number },
  divisions: Division[],
  skip: SkipPattern,
  saved: SavedScores | undefined,
  flagged: ReadonlySet<string> = new Set(),
): GamesView {
  const scorePage = createDemoScoresWithSaves(kind, session, divisions, saved)
  const recap = createDemoRecapSheets(kind, session, divisions)
  // The recap sheets have their own ids; the saved position is the same bowler in both.
  const crossOf = new Map(recap.sheets.map((sheet) => [sheet.position, sheet.cross[skip]]))
  const bowlers = scorePage.pairs.flatMap((pair) => pair.bowlers)
  const gameCount = scorePage.session.games

  const games = Array.from({ length: gameCount }, (_, index): Game => {
    const placed = bowlers.map((bowler) => ({
      bowler,
      label: crossOf.get(bowler.position)?.[index] ?? bowler.position,
    }))
    const byPair = new Map<number, typeof placed>()
    for (const item of placed) {
      const lane = laneOf(item.label)
      const first = lane % 2 === 1 ? lane : lane - 1
      byPair.set(first, [...(byPair.get(first) ?? []), item])
    }
    const pairs = [...byPair.entries()]
      .toSorted(([a], [b]) => a - b)
      .map(([first, items]) =>
        createGamePair(
          first,
          items
            .toSorted((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }))
            .map(({ bowler, label }) =>
              createGameBowler({
                registrationId: bowler.registrationId,
                name: bowler.name,
                divisionName: bowler.divisionName,
                lane: label,
                score: bowler.scores[index] ?? null,
                scores: bowler.scores,
                total: bowler.total,
                dnf: flagged.has(bowler.registrationId),
              }),
            ),
        ),
      )
    return createGame(index + 1, pairs)
  })

  return createGamesView({
    session: {
      id: session.id,
      kind,
      date: session.date,
      complete: session.complete,
      games: gameCount,
    },
    skip,
    games,
    withoutLane: scorePage.noLane + scorePage.other.length,
  })
}

/** What the mock `PUT` and `DELETE` decide (SCR-19), as the API's plan does, in short. */
export type MockScoreChange =
  { status: 200; scores: (number | null)[] } | { status: 400 | 404 | 409; message: string }

/**
 * The mock twin of `planSave` and `planClear` (SCR-01, SCR-03, D-229, D-238): a score of 1 to 300,
 * a game of 1 to the games, earlier empty games filled with 0, and a clear only from the last game
 * back. The API's tests cover the real rules; this keeps the browser demo honest.
 */
export function mockScoreChange(
  stored: readonly (number | null)[],
  games: number,
  game: number,
  score: number | null,
  complete: boolean,
): MockScoreChange {
  if (complete) return { status: 409, message: 'This session is complete. Scores cannot change.' }
  if (!Number.isInteger(game) || game < 1 || game > games) {
    return { status: 400, message: `Game must be from 1 to ${games}.` }
  }
  const row = Array.from({ length: games }, (_, index) => stored[index] ?? null)
  if (score === null) {
    if (row[game - 1] === null) return { status: 404, message: 'No score to clear.' }
    const last = row.findLastIndex((value) => value !== null) + 1
    if (last > game) return { status: 409, message: `Clear game ${last} first.` }
    return { status: 200, scores: row.map((value, index) => (index + 1 === game ? null : value)) }
  }
  if (!Number.isInteger(score) || score < 1 || score > 300) {
    return { status: 400, message: 'Enter a score from 1 to 300.' }
  }
  return {
    status: 200,
    scores: row.map((value, index) => {
      if (index + 1 === game) return score
      return index + 1 < game && value === null ? 0 : value
    }),
  }
}
