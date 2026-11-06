import type { DivisionEditInfo, DivisionFieldNotes } from './types'

const bowlers = (count: number) =>
  count === 1 ? '1 bowler is registered' : `${count} bowlers are registered`

/**
 * What the edit page tells the director before they type (D-147): which boxes ask for a
 * confirmation and why. The API works the same out again on every save and stays the authority
 * (D-129); keep these words in step with `editPlan.ts` there. Nothing is locked: a division only
 * refuses an edit when its tournament is complete, which the page shows instead of the form.
 */
export function editNotes(info: DivisionEditInfo): DivisionFieldNotes {
  const notes: DivisionFieldNotes = {}
  if (info.registrationCount > 0) {
    const registered = `${bowlers(info.registrationCount)} in this division. The change is not retroactive; review them by hand.`
    for (const name of [
      'gender',
      'minimumAge',
      'maximumAge',
      'minimumAverage',
      'maximumAverage',
    ] as const) {
      notes[name] = registered
    }
  }
  const results = 'Scores are saved for bowlers in this division. Posted results change at once.'
  if (info.hasScores) {
    notes.handicapPercentage = results
    notes.handicapBase = results
    notes.maximumHandicapPerGame = results
  }
  if (info.registrationCount > 0) {
    const switching = `Setting or clearing it while ${bowlers(info.registrationCount)} also asks you to confirm: handicap divisions need a USBC ID.`
    notes.handicapPercentage =
      notes.handicapPercentage === undefined
        ? switching
        : `${notes.handicapPercentage} ${switching}`
  }
  return notes
}
