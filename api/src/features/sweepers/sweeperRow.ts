import { localDateTime, toNumber, type SessionRow } from '../../shared/sessions.ts'
import { sweeperSchema, type Sweeper } from './types.ts'

/** A stored `SweeperDivision` row, with the name of its division. */
export interface DivisionPins {
  divisionId: string
  divisionName: string
  /** NULL counts as 0. */
  bonusPinsPerGame: number | null
}

/**
 * Turn a stored sweeper row (`SquadType` 1) into the shape the Sweepers page reads. A sweeper
 * needs a fee, games, and a cash ratio (SQD-11, SQD-12); a row without them does not fit, and the
 * repository skips and logs it (D-42). `pins` are the sweeper's stored rows in division order. A
 * division with no row, a NULL, or a 0 has no bonus (`SCR-09`) and is not listed (D-45); this is
 * the one place that rule lives.
 */
export function toSweeper(row: SessionRow, pins: DivisionPins[]) {
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
    bonusPins: pins.flatMap(({ divisionId, divisionName, bonusPinsPerGame }) =>
      bonusPinsPerGame === null || bonusPinsPerGame === 0
        ? []
        : [{ divisionId, divisionName, bonusPinsPerGame }],
    ),
  } satisfies Record<keyof Sweeper, unknown>)
}
