import type { SkipPattern } from '../skip/api'
import type { SessionKind } from '../../shared/session'

/**
 * One bowler on a pair of lanes in one game (SCR-22, D-234). `lane` is the label for that game,
 * such as `13A`. `score` is that game's score, `null` for none; a stored 0 is a missed game
 * (D-229). `scores` holds every game. The API's `features/scores/gamesTypes.ts` has the same
 * fields: change both together.
 */
export interface GameBowler {
  registrationId: string
  /** `First Last`, plus `, Suffix`. */
  name: string
  divisionName: string
  lane: string
  score: number | null
  scores: (number | null)[]
  total: number
  /** Flagged "did not finish" (D-248): the full-game count leaves the bowler out. */
  dnf: boolean
}

/** A pair of lanes as bowled in one game. */
export interface GamePair {
  firstLane: number
  lanes: number[]
  bowlers: GameBowler[]
}

export interface Game {
  game: number
  /** Bowlers with a score in this game. */
  entered: number
  /**
   * Bowlers expected to bowl it: everyone with a lane, except one flagged did not finish who has no
   * score in this game.
   */
  total: number
  pairs: GamePair[]
}

/** What `GET .../scores/games` returns (SCR-22): exactly one `Game` for each game of the session. */
export interface GamesView {
  session: {
    id: string
    kind: SessionKind
    /** The center's local time with no zone: `2026-10-24T09:00:00`. */
    date: string
    complete: boolean
    games: number
  }
  skip: SkipPattern
  games: Game[]
  /** Bowlers with no lane, who cannot be entered (D-71). */
  withoutLane: number
}

/** What a saved or cleared score answers (SCR-19): the bowler's scores after the write, and the total. */
export interface ScoreSaveResult {
  scores: (number | null)[]
  total: number
}
