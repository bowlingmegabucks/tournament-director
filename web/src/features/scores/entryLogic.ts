import type { Game, GameBowler, GamePair, GamesView, ScoreSaveResult } from './gamesTypes'

export const MIN_SCORE = 1
export const MAX_SCORE = 300

/** What a score box holds: digits only, at most three (SCR-01). A paste or a keyboard cannot add more. */
export function digitsOnly(text: string): string {
  return text.replaceAll(/\D/g, '').slice(0, 3)
}

/** The score a box holds, or the words that say what is wrong (SCR-01). An empty box is neither. */
export function readScore(text: string): { score: number } | { problem: string } {
  const score = Number(text)
  if (text === '' || !Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
    return { problem: `Enter a score from ${MIN_SCORE} to ${MAX_SCORE}.` }
  }
  return { score }
}

/**
 * The game a keeper should start on (SCR-21): the lowest game that still misses a score, or game 1
 * when every score is in.
 */
export function firstOpenGame(view: GamesView): number {
  return view.games.find((game) => game.entered < game.total)?.game ?? 1
}

/** The lanes a keeper works, as typed on the board; either end may be empty (D-230). */
export interface LaneRange {
  from: string
  to: string
}

/**
 * The pairs that have a lane inside the range (D-230). An empty or unreadable end is open, so a
 * range of "1" to "" is lane 1 and up. The range is a convenience, never a lock.
 */
export function pairsInRange(pairs: readonly GamePair[], range: LaneRange): GamePair[] {
  const from = Number.parseInt(range.from, 10)
  const to = Number.parseInt(range.to, 10)
  const low = Number.isNaN(from) ? Number.NEGATIVE_INFINITY : from
  const high = Number.isNaN(to) ? Number.POSITIVE_INFINITY : to
  return pairs.filter((pair) => pair.lanes.some((lane) => lane >= low && lane <= high))
}

/** A bowler Find a bowler found, with the pair and lane of the picked game. */
export interface BowlerHit {
  registrationId: string
  name: string
  lane: string
  firstLane: number
}

const words = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean)

/**
 * Find a bowler in one game (D-230): every typed word starts a word of the name or the division.
 * Nothing typed finds nothing. This is the way to reach a bowler who is not where the cross says
 * (D-236).
 */
export function findBowlers(game: Game, query: string): BowlerHit[] {
  const typed = words(query)
  if (typed.length === 0) return []
  return game.pairs.flatMap((pair) =>
    pair.bowlers
      .filter((bowler) => {
        const have = words(`${bowler.name} ${bowler.divisionName}`)
        return typed.every((word) => have.some((candidate) => candidate.startsWith(word)))
      })
      .map((bowler) => ({
        registrationId: bowler.registrationId,
        name: bowler.name,
        lane: bowler.lane,
        firstLane: pair.firstLane,
      })),
  )
}

/** The games before `game` with no score, which saving `game` fills with 0 (D-229). */
export function gamesToFill(bowler: GameBowler, game: number): number[] {
  return bowler.scores.flatMap((score, index) =>
    index + 1 < game && score === null ? [index + 1] : [],
  )
}

/** "games 1 and 2" for the hint above a field. */
export function sayGames(games: readonly number[]): string {
  const [only, ...rest] = games
  if (only === undefined) return ''
  if (rest.length === 0) return `game ${only}`
  const last = rest.at(-1)
  const head = [only, ...rest.slice(0, -1)].join(', ')
  return `games ${head} and ${last}`
}

/** The other games of a bowler as plain text: "Game 1: 178 · Game 2: 0 · missed" (D-229). */
export function priorGames(bowler: GameBowler, game: number): string {
  return bowler.scores
    .flatMap((score, index) => {
      if (index + 1 === game || score === null) return []
      return [`Game ${index + 1}: ${score === 0 ? '0 · missed' : score}`]
    })
    .join(' · ')
}

/**
 * "N of M in" for some bowlers of one game: those with a score, of those expected to bowl it. A
 * bowler flagged did not finish with no score in this game is not expected (D-248), so a pair whose
 * other bowler walked off reads "1 of 1 in".
 */
export function countIn(bowlers: readonly GameBowler[]): { entered: number; total: number } {
  return {
    entered: bowlers.filter((bowler) => bowler.score !== null).length,
    total: bowlers.filter((bowler) => bowler.score !== null || !bowler.dnf).length,
  }
}

/**
 * Lay what a save answered over the games (SCR-19): the bowler's scores and total in every game
 * they appear in, each game's own score, and each game's count. A save that filled earlier games
 * with 0 shows at once, with no second read.
 */
export function applySaved(
  view: GamesView,
  registrationId: string,
  saved: ScoreSaveResult,
  clearsDnf = false,
): GamesView {
  const games = view.games.map((game) => {
    const pairs = game.pairs.map((pair) => ({
      ...pair,
      bowlers: pair.bowlers.map((bowler) =>
        bowler.registrationId === registrationId
          ? {
              ...bowler,
              scores: saved.scores,
              total: saved.total,
              score: saved.scores[game.game - 1] ?? null,
              // D-250: a saved score takes the flag off. A clear does not.
              dnf: clearsDnf ? false : bowler.dnf,
            }
          : bowler,
      ),
    }))
    return { ...game, pairs, ...countIn(pairs.flatMap((pair) => pair.bowlers)) }
  })
  return { ...view, games }
}

/** The view with one bowler flagged "did not finish", or not, in every game they appear in (SCR-24). */
export function applyDnf(view: GamesView, registrationId: string, dnf: boolean): GamesView {
  return {
    ...view,
    games: view.games.map((game) => {
      const pairs = game.pairs.map((pair) => ({
        ...pair,
        bowlers: pair.bowlers.map((bowler) =>
          bowler.registrationId === registrationId ? { ...bowler, dnf } : bowler,
        ),
      }))
      return { ...game, pairs, ...countIn(pairs.flatMap((pair) => pair.bowlers)) }
    }),
  }
}
