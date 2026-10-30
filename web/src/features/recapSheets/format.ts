// Text on the printed recap sheet (RPT-05a). The dates are in shared/sessionFormat.

/** The handicap column: a dash when the handicap is 0 or less (RPT-05a). */
export function formatHandicap(handicap: number): string {
  return handicap > 0 ? String(handicap) : '-'
}

/** The Totals row: the handicap for every game, or a dash (RPT-05a). */
export function formatHandicapTotal(handicap: number, games: number): string {
  return handicap > 0 ? String(handicap * games) : '-'
}
