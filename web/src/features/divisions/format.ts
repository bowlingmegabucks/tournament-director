import type { Division } from './types'

/** "Any" for no limit; "18 to 39"; "50 and up"; "Up to 199". Used for ages and averages. */
export function formatRange(minimum: number | null, maximum: number | null): string {
  if (minimum !== null && maximum !== null) return `${minimum} to ${maximum}`
  if (minimum !== null) return `${minimum} and up`
  if (maximum !== null) return `Up to ${maximum}`
  return 'Any'
}

export function formatGender(gender: Division['gender']): string {
  return gender ?? 'Any'
}

/**
 * "Scratch" with no handicap; "90% of 220"; "90% of 220, max 40 a game". Rules DIV-09 and DIV-11
 * keep a new division to these forms, but a stored old row may hold only one of percent and base,
 * so show what is there rather than hide it.
 */
export function formatHandicap({
  handicapPercentage: percent,
  handicapBase: base,
  maximumHandicapPerGame: cap,
}: Pick<Division, 'handicapPercentage' | 'handicapBase' | 'maximumHandicapPerGame'>): string {
  if (percent === null && base === null) return 'Scratch'
  let text: string
  if (percent !== null && base !== null) text = `${percent}% of ${base}`
  else if (percent !== null) text = `${percent}%`
  else text = `Base ${base}`
  return cap === null ? text : `${text}, max ${cap} a game`
}
