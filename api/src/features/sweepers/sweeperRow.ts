import { localDateTime, toNumber, type SessionRow } from '../../shared/sessions.ts'
import { sweeperSchema, type Sweeper } from './types.ts'

/** One division of the sweeper's tournament, with the stored pins (`undefined` when no row exists). */
export interface DivisionPins {
  divisionId: string
  divisionName: string
  bonusPinsPerGame: number | null | undefined
}

/**
 * Turn a stored sweeper row (`SquadType` 1) into the shape the Sweepers page reads. A sweeper
 * needs a fee, games, and a cash ratio (SQD-11, SQD-12); a row without them does not fit, and the
 * repository skips and logs it (D-42). `divisions` is the tournament's divisions in order. A
 * missing row, a NULL, and a 0 all mean no bonus (`SCR-09`) and are left out (D-45).
 */
export function toSweeper(row: SessionRow, divisions: DivisionPins[]) {
  return sweeperSchema.safeParse({
    id: row.id,
    date: localDateTime(row.date),
    complete: row.complete,
    startingLane: row.startingLane,
    numberOfLanes: row.numberOfLanes,
    maxPerPair: row.maxPerPair,
    entryFee: toNumber(row.sweeperEntryFee),
    games: row.games,
    cashRatio: toNumber(row.cashRatio),
    bonusPins: divisions
      .filter(({ bonusPinsPerGame }) => bonusPinsPerGame)
      .map(({ divisionId, divisionName, bonusPinsPerGame }) => ({
        divisionId,
        divisionName,
        bonusPinsPerGame,
      })),
  } satisfies Record<keyof Sweeper, unknown>)
}
