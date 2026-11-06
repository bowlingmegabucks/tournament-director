import { randomUUID } from 'node:crypto'
import { planCreate, type CreateFacts, type DivisionWarning } from './createPlan.ts'
import type { FieldErrors, NewDivision } from './createRequest.ts'
import { noDivisionEditFacts, type DivisionEditFacts, type DivisionEditInfo } from './editFacts.ts'
import { planEdit, type DivisionEditState } from './editPlan.ts'
import type { Division } from './types.ts'
import type { UpdateDivision } from './updateRequest.ts'

/** How a create ended (DIV-12). Only `created` stored anything. */
export type CreateDivisionOutcome =
  | { notFound: true }
  /** A complete tournament or a name already used: 409 with `errors` (D-140, D-143). */
  | { refused: FieldErrors }
  /** The director must confirm first: 409 with `warnings` (D-142). */
  | { warnings: DivisionWarning[] }
  | { created: Division }

/** Which id an edit could not find. A division of another tournament counts as not found. */
export interface NotFound {
  notFound: 'tournament' | 'division'
}

/** How an edit ended (DIV-12). Only `updated` may have stored anything. */
export type UpdateDivisionOutcome =
  | NotFound
  /** A pair rule fails on the merged values: 400 with `errors`. */
  | { invalid: FieldErrors }
  /** A complete tournament or a name already used: 409 with `errors` (D-140, D-149). */
  | { refused: FieldErrors }
  /** The director must confirm first: 409 with `warnings` (D-147). */
  | { warnings: DivisionWarning[] }
  | { updated: Division; changed: (keyof NewDivision)[] }

/** What the create, edit, and edit-info routes need from storage. The Prisma version writes the legacy table. */
export interface DivisionWriter {
  create(
    tournamentId: string,
    input: NewDivision,
    options: { confirmWarnings: boolean },
  ): Promise<CreateDivisionOutcome>
  update(
    tournamentId: string,
    divisionId: string,
    changes: UpdateDivision,
    options: { confirmWarnings: boolean },
  ): Promise<UpdateDivisionOutcome>
  /** What the edit page shows before the director types (D-147). */
  getEditInfo(tournamentId: string, divisionId: string): Promise<DivisionEditInfo | NotFound>
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

/**
 * Plan an edit and, when it saves, hand the changes to `persist`. Both versions of the writer use
 * this, so the rules live in one place (`planEdit`) and storage only reads and writes.
 */
export async function applyUpdate(
  state: DivisionEditState,
  sent: UpdateDivision,
  confirmWarnings: boolean,
  persist: (changes: UpdateDivision) => Promise<void>,
): Promise<UpdateDivisionOutcome> {
  const plan = planEdit(state, sent, confirmWarnings)
  switch (plan.kind) {
    case 'invalid':
      return { invalid: plan.errors }
    case 'refused':
      return { refused: plan.errors }
    case 'warn':
      return { warnings: plan.warnings }
    case 'save': {
      const changed = Object.keys(plan.changes) as (keyof NewDivision)[]
      if (changed.length > 0) await persist(plan.changes)
      return { updated: { ...state.stored, ...plan.changes }, changed }
    }
  }
}

/** For route tests. `stored` holds what was written; a tournament not in `known` is a 404. */
export function createInMemoryDivisionWriter(
  options: {
    /** Tournament ids that exist. Left out, every id exists. */
    known?: string[]
    completed?: string[]
    seed?: { tournamentId: string; division: Division }[]
    /** Per division id: what the edit rules look at (D-147). */
    editFacts?: Record<string, Partial<DivisionEditFacts>>
  } = {},
) {
  const stored = [...(options.seed ?? [])]
  const locate = (
    tournamentId: string,
    divisionId: string,
  ): NotFound | { entry: (typeof stored)[number] } => {
    if (options.known && !options.known.includes(tournamentId)) {
      return { notFound: 'tournament' }
    }
    const entry = stored.find(
      (e) => e.tournamentId === tournamentId && e.division.id === divisionId,
    )
    // Without a `known` list, a tournament is known when it holds a division or is never asked about.
    return entry ? { entry } : { notFound: 'division' }
  }
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
    update: (tournamentId, divisionId, changes, { confirmWarnings }) => {
      const found = locate(tournamentId, divisionId)
      if (!('entry' in found)) return Promise.resolve(found)
      return applyUpdate(
        {
          tournamentCompleted: options.completed?.includes(tournamentId) ?? false,
          stored: { ...found.entry.division },
          facts: { ...noDivisionEditFacts, ...options.editFacts?.[divisionId] },
          otherNames: stored
            .filter((e) => e.tournamentId === tournamentId && e.division.id !== divisionId)
            .map((e) => e.division.name),
        },
        changes,
        confirmWarnings,
        (saved) => {
          Object.assign(found.entry.division, saved)
          return Promise.resolve()
        },
      )
    },
    getEditInfo: (tournamentId, divisionId) => {
      const found = locate(tournamentId, divisionId)
      if (!('entry' in found)) return Promise.resolve(found)
      return Promise.resolve({ ...noDivisionEditFacts, ...options.editFacts?.[divisionId] })
    },
  }
  return { writer, stored }
}
