/** The division settings handicap needs (SCR-07). `handicapPercentage` is a whole percent: 90 for 0.90. */
export interface HandicapSettings {
  handicapBase: number | null
  handicapPercentage: number | null
  maximumHandicapPerGame: number | null
}

/** SCR-07 caps a handicap at 999 when the division sets no maximum. */
const NO_MAXIMUM = 999

/**
 * SCR-07: pins added per game. Zero when the average, base, or percentage is missing, or when the
 * average reaches the base. Otherwise `floor((base - average) x percentage)`, capped. Whole-number
 * arithmetic keeps `20 x 90%` at exactly 18.
 */
export function handicap(average: number | null, settings: HandicapSettings): number {
  const { handicapBase, handicapPercentage, maximumHandicapPerGame } = settings
  if (average === null || handicapBase === null || handicapPercentage === null) return 0
  // Stryker disable next-line EqualityOperator: at an average equal to the base the raw handicap is 0 anyway.
  if (average >= handicapBase) return 0
  const raw = Math.floor(((handicapBase - average) * handicapPercentage) / 100)
  return Math.min(raw, maximumHandicapPerGame ?? NO_MAXIMUM)
}
