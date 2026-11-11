/** The tournament of the run (stage 1). Fixed dates in the past (bowlers need real birth dates), so the run does not depend on today. */
export const tournament = {
  name: 'Lifecycle Open',
  start: '2025-03-12',
  end: '2025-03-14',
  bowlingCenter: 'Lifecycle Lanes',
  entryFee: '60',
  games: '6',
  finalsRatio: '7.5',
  cashRatio: '4.5',
  superSweeperCashRatio: '3',
}

/** The free field stage 1 edits (nobody is registered yet, so every field is free). */
export const editedBowlingCenter = 'Lifecycle Lanes East'

/**
 * The earlier, smaller tournament (stage 0). Its 50 bowlers become the main tournament's returning
 * bowlers. One division with no limits, one squad, the tournament's own fee.
 */
export const earlier = {
  name: 'Autumn Warmup',
  start: '2024-09-18',
  end: '2024-09-20',
  bowlingCenter: 'Lifecycle Lanes',
  entryFee: '50',
  games: '4',
  finalsRatio: '7.5',
  cashRatio: '4.5',
  superSweeperCashRatio: '3',
  division: { name: 'Open' },
  squad: { date: '2024-09-18T09:00', startingLane: 1, lanes: 60, perPair: 5 },
}
