import { bowlers, fullName, type Bowler } from './bowlers'

/** Bowlers by the name the score box shows. Names must be unique for the lookup to be safe. */
const byName = new Map(bowlers.map((bowler) => [fullName(bowler), bowler]))
if (byName.size !== bowlers.length) throw new Error('Two bowlers share a name: change the seed')

export const bowlerNamed = (name: string): Bowler => {
  const found = byName.get(name)
  if (!found) throw new Error(`No bowler named ${name}`)
  return found
}

/**
 * A bowler's score in a game: around their average, 20 pins under to 40 over, by a fixed rule on
 * the bowler's number and the game. Never above 300. Designed scores (ties, a no-show, a walk-off,
 * a score edit) override this for chosen bowlers in the results slice.
 */
export function scoreOf(bowler: Bowler, game: number): number {
  const swing = (bowler.index * 31 + game * 47) % 61
  return Math.min(300, bowler.average - 20 + swing)
}

export const scoreFor = (name: string, game: number) => scoreOf(bowlerNamed(name), game)
