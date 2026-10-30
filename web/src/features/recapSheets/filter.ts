import type { RecapSheet } from './types'

/** Words of a text, lower case, split on spaces and commas ("Royer, Joey Jr." gives four). */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((word) => word !== '')
}

/**
 * The sheets that match what the desk typed (D-64, as D-49 does for registrations): a sheet
 * matches when every typed word starts a word of the bowler's name or division. "ro jo" finds
 * Joey Royer, and "senior" finds the bowlers of the Senior division. An empty box matches all.
 */
export function filterSheets(sheets: readonly RecapSheet[], text: string): RecapSheet[] {
  const typed = words(text)
  // With no words, every sheet passes, so an empty box keeps them all.
  return sheets.filter((sheet) => {
    const known = words(`${sheet.name} ${sheet.divisionName}`)
    return typed.every((word) => known.some((candidate) => candidate.startsWith(word)))
  })
}
