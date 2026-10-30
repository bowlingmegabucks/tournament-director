import { localDateTime, toNumber, type SessionRow } from '../../shared/sessions.ts'
import { squadSchema, type Squad } from './types.ts'

/** The tournament values a squad falls back on (TRN-12). */
export interface TournamentDefaults {
  entryFee: number
  finalsRatio: number
  cashRatio: number
  /** Games per squad: a squad never overrides it (TRN-04). */
  games: number
}

/**
 * Turn a stored squad row (`SquadType` 0) into the shape the Squads page reads. The result says
 * whether the row fits; the repository skips and logs a row that does not (D-42). `SQD-01` to
 * `SQD-08` run on save, not on read.
 */
export function toSquad(row: SessionRow, defaults: TournamentDefaults) {
  const entryFee = toNumber(row.squadEntryFee)
  const finalsRatio = toNumber(row.finalsRatio)
  const cashRatio = toNumber(row.cashRatio)
  return squadSchema.safeParse({
    id: row.id,
    date: localDateTime(row.date),
    complete: row.complete,
    startingLane: row.startingLane,
    numberOfLanes: row.numberOfLanes,
    maxPerPair: row.maxPerPair,
    entryFee: entryFee ?? defaults.entryFee,
    entryFeeOverridden: entryFee !== null,
    finalsRatio: finalsRatio ?? defaults.finalsRatio,
    finalsRatioOverridden: finalsRatio !== null,
    cashRatio: cashRatio ?? defaults.cashRatio,
    cashRatioOverridden: cashRatio !== null,
    games: defaults.games,
  } satisfies Record<keyof Squad, unknown>)
}
