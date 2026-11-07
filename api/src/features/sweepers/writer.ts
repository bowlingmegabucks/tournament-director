import { randomUUID } from 'node:crypto'
import { planCreate, type CreateFacts } from './createPlan.ts'
import type { FieldErrors, NewSweeper } from './createRequest.ts'
import type { Sweeper } from './types.ts'

/** How a create ended (SQD-10 to SQD-13). Only `created` stored anything. */
export type CreateSweeperOutcome =
  | { notFound: true }
  /** A complete tournament, a date outside it, or a gone division: 409 with `errors` (D-169, D-171, D-177). */
  | { refused: FieldErrors }
  | { created: Sweeper }

/** What the create route needs from storage. The Prisma version writes the legacy tables. */
export interface SweeperWriter {
  create(tournamentId: string, input: NewSweeper): Promise<CreateSweeperOutcome>
}

/** A division of the tournament, as the writer reads it. */
export interface DivisionName {
  id: string
  name: string
  number: number
}

/**
 * The sweeper as the list reads it: only the nonzero pins, in division order (D-45, D-176). A new
 * sweeper is never complete (SQD-07). `divisions` must hold every division in `input.bonusPins`
 * (the plan has checked that).
 */
export function toCreatedSweeper(
  id: string,
  input: NewSweeper,
  divisions: readonly DivisionName[],
): Sweeper {
  const bonusPins = divisions
    .filter((division) => (input.bonusPins[division.id] ?? 0) !== 0)
    .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name))
    .map((division) => ({
      divisionId: division.id,
      divisionName: division.name,
      bonusPinsPerGame: input.bonusPins[division.id] ?? 0,
    }))
  return {
    id,
    date: input.date,
    complete: false,
    startingLane: input.startingLane,
    numberOfLanes: input.numberOfLanes,
    maxPerPair: input.maxPerPair,
    entryFee: input.entryFee,
    games: input.games,
    cashRatio: input.cashRatio,
    bonusPins,
  }
}

/** The pin rows a create stores: every division with pins other than 0 (D-176). */
export function pinRows(input: NewSweeper): { divisionId: string; bonusPinsPerGame: number }[] {
  return Object.entries(input.bonusPins)
    .filter(([, pins]) => pins !== 0)
    .map(([divisionId, bonusPinsPerGame]) => ({ divisionId, bonusPinsPerGame }))
}

/**
 * Plan a create and, when it goes ahead, call `persist`. Both versions of the writer use this, so
 * the rules live in one place (`planCreate`) and storage only reads and writes.
 */
export async function applyCreate(
  facts: CreateFacts,
  input: NewSweeper,
  persist: () => Promise<Sweeper>,
): Promise<CreateSweeperOutcome> {
  const plan = planCreate(facts, input)
  if (plan.kind === 'refused') return { refused: plan.errors }
  return { created: await persist() }
}

/** For route tests. `stored` holds what was written; a tournament not in `known` is a 404. */
export function createInMemorySweeperWriter(
  options: {
    /** Tournament ids that exist. Left out, every id exists. */
    known?: string[]
    /** Tournament ids that are complete. */
    completed?: string[]
    /** The start and end day every tournament has. */
    dates?: { startDate: string; endDate: string }
    /** The divisions every tournament has. Left out, every division id is known and named by its id. */
    divisions?: DivisionName[]
  } = {},
) {
  const stored: { tournamentId: string; sweeper: Sweeper }[] = []
  const writer: SweeperWriter = {
    create: (tournamentId, input) => {
      if (options.known && !options.known.includes(tournamentId)) {
        return Promise.resolve({ notFound: true })
      }
      const divisions =
        options.divisions ??
        Object.keys(input.bonusPins).map((id, index) => ({ id, name: id, number: index + 1 }))
      const facts: CreateFacts = {
        completed: options.completed?.includes(tournamentId) ?? false,
        startDate: options.dates?.startDate ?? '2000-01-01',
        endDate: options.dates?.endDate ?? '2099-12-31',
        divisionIds: new Set(divisions.map((division) => division.id)),
      }
      return applyCreate(facts, input, () => {
        const sweeper = toCreatedSweeper(randomUUID(), input, divisions)
        stored.push({ tournamentId, sweeper })
        return Promise.resolve({ ...sweeper })
      })
    },
  }
  return { writer, stored }
}
