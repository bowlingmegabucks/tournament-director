/**
 * The desk edits of stage 4, made after the last desk batch and before squad D's lanes. Each touches
 * only squad D and the sweepers (the earlier squads are complete), and each is chosen so the
 * checked results stay the same: low averages, and every division of squad D keeps its entry count.
 *
 * - 7 (Scratch, average 131, in B and C) adds squad D: a prepaid bowler at the desk, collect $60.
 * - 14 (Scratch, 132, in A and D) drops squad D, keeping A: refund $60.
 * - 139 (Scratch, D only) moves to Handicap; 141 (Handicap, D only) moves to Scratch: a division
 *   change each, so squad D keeps 38 Scratch and 32 Handicap entries.
 * - 148 (Scratch, D only) has their average changed from 164 to 154: no fee, no effect on scratch.
 * - 138 (D only, in both sweepers) joins the super sweeper, then leaves it.
 * - 21 adds sweeper two: collect $30. 15 switches from sweeper one to sweeper two: refund $35,
 *   collect $30, net refund $5.
 */
export const edits = {
  addSquad: 7,
  dropSquad: 14,
  toHandicap: 139,
  toScratch: 141,
  averageChange: { bowler: 148, average: 154 },
  superSweeper: 138,
  addSweeper: 21,
  switchSweeper: 15,
}

/** The counts after the edits: squad D is as before (one in, one out); sweeper one lost one, two gained two. */
export const afterEditsExpected = {
  squadEntries: { A: 60, B: 65, C: 73, D: 87 },
  sweeperOneEntries: 49,
  sweeperTwoEntries: 77,
  superSweepers: 5,
}
