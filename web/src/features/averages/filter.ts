import type { AverageRow } from './types'

export type AverageFilter = 'unverified' | 'all'

/**
 * The Averages page's two filters (AVG-02, D-295). "Unverified" keeps the rows no director checked;
 * the text keeps a row when every word starts a word of the bowler's name or the USBC ID, ignoring
 * case. Blank text matches everyone.
 */
export function filterAverages(
  rows: readonly AverageRow[],
  filter: AverageFilter,
  text: string,
): AverageRow[] {
  const words = text
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)
  return rows.filter((row) => {
    if (filter === 'unverified' && row.status !== 'unverified') return false
    const fields = [...row.bowlerName.toLowerCase().split(/[\s,]+/), row.usbcId.toLowerCase()]
    return words.every((word) => fields.some((value) => value.startsWith(word)))
  })
}
