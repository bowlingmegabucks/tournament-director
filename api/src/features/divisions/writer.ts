import { randomUUID } from 'node:crypto'
import { planCreate, type CreateFacts, type DivisionWarning } from './createPlan.ts'
import type { FieldErrors, NewDivision } from './createRequest.ts'
import type { Division } from './types.ts'

/** How a create ended (DIV-12). Only `created` stored anything. */
export type CreateDivisionOutcome =
  | { notFound: true }
  /** A complete tournament or a name already used: 409 with `errors` (D-140, D-143). */
  | { refused: FieldErrors }
  /** The director must confirm first: 409 with `warnings` (D-142). */
  | { warnings: DivisionWarning[] }
  | { created: Division }

/** What the create route needs from storage. The Prisma version writes the legacy table. */
export interface DivisionWriter {
  create(
    tournamentId: string,
    input: NewDivision,
    options: { confirmWarnings: boolean },
  ): Promise<CreateDivisionOutcome>
}

/** The stored division for an input and the number the plan chose. */
export function toNewDivision(id: string, number: number, input: NewDivision): Division {
  return { id, number, ...input }
}

/**
 * Plan a create and, when it goes ahead, hand the number to `persist`. Both versions of the writer
 * use this, so the rules live in one place (`planCreate`) and storage only reads and writes.
 */
export async function applyCreate(
  facts: CreateFacts,
  input: NewDivision,
  confirmWarnings: boolean,
  persist: (number: number) => Promise<Division>,
): Promise<CreateDivisionOutcome> {
  const plan = planCreate(facts, input, confirmWarnings)
  switch (plan.kind) {
    case 'refused':
      return { refused: plan.errors }
    case 'warn':
      return { warnings: plan.warnings }
    case 'create':
      return { created: await persist(plan.number) }
  }
}

/** For route tests. `stored` holds what was written; a tournament not in `known` is a 404. */
export function createInMemoryDivisionWriter(
  options: {
    /** Tournament ids that exist. Left out, every id exists. */
    known?: string[]
    completed?: string[]
    seed?: { tournamentId: string; division: Division }[]
  } = {},
) {
  const stored = [...(options.seed ?? [])]
  const writer: DivisionWriter = {
    create: (tournamentId, input, { confirmWarnings }) => {
      if (options.known && !options.known.includes(tournamentId)) {
        return Promise.resolve({ notFound: true })
      }
      const facts: CreateFacts = {
        completed: options.completed?.includes(tournamentId) ?? false,
        divisions: stored
          .filter((entry) => entry.tournamentId === tournamentId)
          .map((entry) => entry.division),
      }
      return applyCreate(facts, input, confirmWarnings, (number) => {
        const division = toNewDivision(randomUUID(), number, input)
        stored.push({ tournamentId, division })
        return Promise.resolve({ ...division })
      })
    },
  }
  return { writer, stored }
}
