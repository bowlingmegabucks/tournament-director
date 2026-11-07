import { randomUUID } from 'node:crypto'
import { planCreate, type CreateFacts } from './createPlan.ts'
import type { FieldErrors, NewSquad } from './createRequest.ts'
import type { TournamentDefaults } from './squadRow.ts'
import type { Squad } from './types.ts'

/** How a create ended (SQD-01 to SQD-08). Only `created` stored anything. */
export type CreateSquadOutcome =
  | { notFound: true }
  /** A complete tournament or a date outside the tournament: 409 with `errors` (D-169, D-171). */
  | { refused: FieldErrors }
  | { created: Squad }

/** What the create route needs from storage. The Prisma version writes the legacy table. */
export interface SquadWriter {
  create(tournamentId: string, input: NewSquad): Promise<CreateSquadOutcome>
}

/**
 * The squad as the list reads it: a blank fee or ratio shows the tournament's value, with its
 * override flag false (TRN-12, D-43). A new squad is never complete (SQD-07).
 */
export function toCreatedSquad(id: string, input: NewSquad, defaults: TournamentDefaults): Squad {
  return {
    id,
    date: input.date,
    complete: false,
    startingLane: input.startingLane,
    numberOfLanes: input.numberOfLanes,
    maxPerPair: input.maxPerPair,
    entryFee: input.entryFee ?? defaults.entryFee,
    entryFeeOverridden: input.entryFee !== null,
    finalsRatio: input.finalsRatio ?? defaults.finalsRatio,
    finalsRatioOverridden: input.finalsRatio !== null,
    cashRatio: input.cashRatio ?? defaults.cashRatio,
    cashRatioOverridden: input.cashRatio !== null,
    games: defaults.games,
  }
}

/**
 * Plan a create and, when it goes ahead, call `persist`. Both versions of the writer use this, so
 * the rules live in one place (`planCreate`) and storage only reads and writes.
 */
export async function applyCreate(
  facts: CreateFacts,
  input: NewSquad,
  persist: () => Promise<Squad>,
): Promise<CreateSquadOutcome> {
  const plan = planCreate(facts, input)
  if (plan.kind === 'refused') return { refused: plan.errors }
  return { created: await persist() }
}

const wideOpen: CreateFacts & TournamentDefaults = {
  // Stryker disable next-line BooleanLiteral: the writer always sets `completed` from its options.
  completed: false,
  // Stryker disable next-line StringLiteral: an empty start date is before no day, the same as 2000-01-01.
  startDate: '2000-01-01',
  endDate: '2099-12-31',
  entryFee: 50,
  finalsRatio: 6,
  cashRatio: 4,
  games: 5,
}

/** For route tests. `stored` holds what was written; a tournament not in `known` is a 404. */
export function createInMemorySquadWriter(
  options: {
    /** Tournament ids that exist. Left out, every id exists. */
    known?: string[]
    /** Tournament ids that are complete. */
    completed?: string[]
    /** The dates, fee, ratios, and games every tournament has. */
    tournament?: Partial<typeof wideOpen>
  } = {},
) {
  const stored: { tournamentId: string; squad: Squad }[] = []
  const writer: SquadWriter = {
    create: (tournamentId, input) => {
      if (options.known && !options.known.includes(tournamentId)) {
        return Promise.resolve({ notFound: true })
      }
      const facts = {
        ...wideOpen,
        ...options.tournament,
        completed: options.completed?.includes(tournamentId) ?? false,
      }
      return applyCreate(facts, input, () => {
        const squad = toCreatedSquad(randomUUID(), input, facts)
        stored.push({ tournamentId, squad })
        return Promise.resolve({ ...squad })
      })
    },
  }
  return { writer, stored }
}
