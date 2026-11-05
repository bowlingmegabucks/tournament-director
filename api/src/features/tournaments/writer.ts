import { randomUUID } from 'node:crypto'
import type { FieldErrors, NewTournament } from './createRequest.ts'
import { noEditFacts, type EditFacts } from './editFacts.ts'
import { planDelete, type DeleteFacts, type DeleteWarning } from './deletePlan.ts'
import { planEdit, type EditState, type EditWarning, type StoredTournament } from './editPlan.ts'
import type { CreatedTournament } from './types.ts'
import type { UpdateTournament } from './updateRequest.ts'

export type CreateTournamentOutcome =
  | { created: CreatedTournament }
  /** A tournament with this name and start date is already stored (D-123). */
  | { duplicate: true }

/** How an edit ended (TRN-24 to TRN-27). Only `updated` changed anything. */
export type UpdateTournamentOutcome =
  | { notFound: true }
  /** The dates are out of order (400). */
  | { invalid: FieldErrors }
  /** A lock holds: complete, scores, or a squad outside the dates (409, D-128, D-130). */
  | { refused: FieldErrors }
  | { duplicate: true }
  /** The director must confirm these first (409, D-129). */
  | { warnings: EditWarning[] }
  /** `changed` is empty when nothing differed from what was stored. */
  | { updated: CreatedTournament; changed: (keyof NewTournament)[] }

/** How a delete ended (TRN-32 to TRN-35). Only `deleted` removed anything. */
export type DeleteTournamentOutcome =
  | { notFound: true }
  /** A fact forbids it: one line per reason (409 with `errors`, D-133). */
  | { refused: string[] }
  /** The caller must confirm first (409 with `warnings`, D-134). */
  | { warnings: DeleteWarning[] }
  /** What was removed, for the log line. */
  | { deleted: DeleteFacts }

/** What the create, edit, and delete routes need from storage. The Prisma version writes to the legacy table. */
export interface TournamentWriter {
  create(input: NewTournament): Promise<CreateTournamentOutcome>
  /** Edit the fields sent (D-127). Last save wins: there is no version check. */
  update(id: string, input: UpdateTournament): Promise<UpdateTournamentOutcome>
  /**
   * Delete the tournament with its divisions, squads, sweepers, registrations, and payments, once
   * `planDelete` allows it (D-132 to D-135). Bowlers stay.
   */
  remove(id: string, options: { confirmWarnings: boolean }): Promise<DeleteTournamentOutcome>
}

/**
 * Plan a delete and, when it goes ahead, hand the facts to `persist`. Both versions of the writer
 * use this, so the rules live in one place (`planDelete`) and storage only reads and deletes.
 */
export async function applyDelete(
  facts: DeleteFacts,
  confirmWarnings: boolean,
  persist: () => Promise<void>,
): Promise<DeleteTournamentOutcome> {
  const plan = planDelete(facts, confirmWarnings)
  switch (plan.kind) {
    case 'refused':
      return { refused: plan.reasons }
    case 'warn':
      return { warnings: plan.warnings }
    case 'delete':
      await persist()
      return { deleted: facts }
  }
}

/**
 * Plan an edit and, when it saves, hand the changes to `persist`. Both versions of the writer use
 * this, so the rules live in one place (`planEdit`) and storage only reads and writes.
 */
export async function applyEdit(
  id: string,
  state: EditState,
  input: UpdateTournament,
  persist: (changes: Partial<NewTournament>) => Promise<void>,
): Promise<UpdateTournamentOutcome> {
  const plan = await planEdit(state, input)
  switch (plan.kind) {
    case 'invalid':
      return { invalid: plan.errors }
    case 'refused':
      return { refused: plan.errors }
    case 'duplicate':
      return { duplicate: true }
    case 'warn':
      return { warnings: plan.warnings }
    case 'save': {
      const changed = Object.keys(plan.changes) as (keyof NewTournament)[]
      if (changed.length > 0) await persist(plan.changes)
      // The flag is not part of what the web app sees (D-131 sends it with the settings).
      // Left out on purpose: the flag is not part of what the web app sees here.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { completed, ...fields } = state.stored
      return { updated: { id, ...fields, ...plan.changes }, changed }
    }
  }
}

// D-123: same name (trimmed, any case) and same start date.
export const sameTournament = (
  stored: { name: string; startDate: string },
  input: { name: string; startDate: string },
) =>
  stored.startDate === input.startDate &&
  stored.name.trim().toLowerCase() === input.name.trim().toLowerCase()

/** For route tests. Keeps what it was given in `stored`. */
export function createInMemoryTournamentWriter(
  seed: CreatedTournament[] = [],
  /** Per tournament id: what the edit rules look at (D-128), and the complete flag (D-130). */
  options: {
    facts?: Record<string, Partial<EditFacts>>
    completed?: string[]
    /** Per tournament id: what a delete looks at (D-133), when a test needs more than nothing. */
    deleteFacts?: Record<string, Partial<DeleteFacts>>
  } = {},
) {
  const stored = [...seed]
  const deleted: string[] = []
  const writer: TournamentWriter = {
    create: (input) => {
      if (stored.some((existing) => sameTournament(existing, input))) {
        return Promise.resolve({ duplicate: true })
      }
      const created = { ...input, id: randomUUID() }
      stored.push(created)
      return Promise.resolve({ created: { ...created } })
    },
    update: async (id, input) => {
      const found = stored.find((existing) => existing.id === id)
      if (!found) return { notFound: true }
      const current: StoredTournament = {
        name: found.name,
        startDate: found.startDate,
        endDate: found.endDate,
        bowlingCenter: found.bowlingCenter,
        entryFee: found.entryFee,
        games: found.games,
        finalsRatio: found.finalsRatio,
        cashRatio: found.cashRatio,
        superSweeperCashRatio: found.superSweeperCashRatio,
        completed: options.completed?.includes(id) ?? false,
      }
      return applyEdit(
        id,
        {
          stored: current,
          facts: { ...noEditFacts, ...options.facts?.[id] },
          hasRival: (name, startDate) =>
            Promise.resolve(
              stored.some((other) => other.id !== id && sameTournament(other, { name, startDate })),
            ),
        },
        input,
        (changes) => {
          Object.assign(found, changes)
          return Promise.resolve()
        },
      )
    },
    remove: (id, { confirmWarnings }) => {
      const index = stored.findIndex((existing) => existing.id === id)
      if (index === -1) return Promise.resolve({ notFound: true })
      const facts: DeleteFacts = {
        completed: options.completed?.includes(id) ?? false,
        hasScores: false,
        paidRegistrations: 0,
        registrations: 0,
        divisions: 0,
        squads: 0,
        sweepers: 0,
        ...options.deleteFacts?.[id],
      }
      return applyDelete(facts, confirmWarnings, () => {
        stored.splice(index, 1)
        deleted.push(id)
        return Promise.resolve()
      })
    },
  }
  return { writer, stored, deleted }
}
