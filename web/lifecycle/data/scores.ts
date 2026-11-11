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
 * Designed scores: six fixed games for a chosen bowler in one squad, keyed by the squad letter and
 * the bowler's number. Everyone else follows `formulaScore`. Totals are in the comments; each line
 * sits among the formula bowlers' totals so the places are the ones named.
 *
 * Squad A Scratch (5 advance, 3 cash): 34 and 48 tie on total at the cut line (34 wins on high
 * game); 82 and 96 tie fully across the cash line.
 * Squad A Women or Seniors (2 advance, 2 cash): 0 is first; 10 and 24 tie fully across the cut
 * line. Bowler 0 then enters squad C as an earlier advancer.
 * Squad A Handicap (3 entries, so no advancer and one casher): 97 has the lowest scratch and the
 * highest handicap total, so the handicap puts the lowest scratch first.
 * Squad C Women or Seniors: bowler 0, an earlier advancer, ranks first again.
 * Squad B Scratch (4 advance, 3 cash): 47 and 19 tie on total across the cash line, and 47 wins on
 * the second-best game. The formula gives 55 and 75 the same games (a tie inside the advancers),
 * so the page lists them in either order.
 * Squad B Handicap (28 entries, 3 advance, 3 cash): no designed lines; the handicap puts 77, whose
 * scratch total is the lowest of the three, third.
 */
export const designedScores: Record<string, readonly number[]> = {
  A34: [252, 230, 215, 200, 215, 210], // 1322, high game 252
  A48: [247, 229, 214, 205, 212, 215], // 1322, high game 247
  A82: [213, 199, 246, 232, 218, 200], // 1308
  A96: [200, 218, 232, 246, 199, 213], // 1308, the same games in another order
  A0: [205, 210, 198, 215, 202, 207], // 1237
  A10: [202, 188, 174, 160, 207, 193], // 1124
  A24: [193, 207, 160, 174, 188, 202], // 1124, the same games in another order
  A97: [160, 150, 150, 145, 150, 145], // 900 scratch, 480 handicap: 1380
  C0: [215, 200, 205, 210, 198, 212], // 1240
  B47: [240, 235, 200, 205, 200, 210], // 1290, high game 240, second-best game 235
  B19: [240, 228, 205, 207, 205, 205], // 1290, high game 240, second-best game 228
}

/** The rule for a bowler with no designed line: 20 pins under their average to 40 over. Never above 300. */
function formulaScore(bowler: Bowler, game: number): number {
  const swing = (bowler.index * 31 + game * 47) % 61
  return Math.min(300, bowler.average - 20 + swing)
}

/** A bowler's score in a game of one squad (`'A'` to `'D'`). */
export function scoreOf(bowler: Bowler, game: number, squad: string): number {
  return designedScores[`${squad}${bowler.index}`]?.[game - 1] ?? formulaScore(bowler, game)
}

export const scoreFor = (name: string, game: number, squad: string) =>
  scoreOf(bowlerNamed(name), game, squad)
