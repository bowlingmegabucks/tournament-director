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
 * Squad B Handicap (28 entries, 3 advance, 3 cash): the handicap puts 77, whose scratch total is
 * the lowest of the three, third. Bowler 65 totals 1380 with handicap, the same as bowler 97 in A,
 * with the higher game: the two tie for the one at-large spot, and 65 wins it.
 *
 * Sweeper one (50 entries, 7 cash, bonus pins 15 a game for Women or Seniors): 54 and 81 tie fully
 * across the cash line; 24 has 45 pins that lift a scratch total of 605 above bowler 12's 645.
 * Sweeper two (75 entries, 15 cash): 130 and 40 tie fully across the cash line; 12 has the second
 * best total.
 * Super sweeper (bowlers 0, 6, 12, 90, 96; one casher): 6 and 12 tie on total (1344) across the
 * cash line, and 12 wins on high game; 0 beats 96 only through the pins (scratch 1225 against 1248,
 * total 1270 against 1248).
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
  B65: [200, 190, 185, 180, 170, 161], // 1086 scratch, 294 handicap: 1380, high game 200 + 49
  S1_54: [195, 242, 218], // 655
  S1_81: [242, 218, 195], // 655, the same games in another order
  S1_24: [210, 200, 195], // 605 scratch, 650 with 45 pins
  S1_0: [200, 205, 190], // 595 scratch, 640 with 45 pins
  S2_12: [250, 229, 220], // 699, high game 250
  S2_130: [233, 219, 186], // 638
  S2_0: [215, 205, 210], // 630
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
  return (
    designedScores[`${squad}${squad.startsWith('S') ? '_' : ''}${bowler.index}`]?.[game - 1] ??
    formulaScore(bowler, game)
  )
}

export const scoreFor = (name: string, game: number, squad: string) =>
  scoreOf(bowlerNamed(name), game, squad)
