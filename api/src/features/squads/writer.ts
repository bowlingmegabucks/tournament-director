import { randomUUID } from 'node:crypto'
import { planCreate, type CreateFacts } from './createPlan.ts'
import type { FieldErrors, NewSquad } from './createRequest.ts'
import {
  noSessionEditFacts,
  toSessionEditInfo,
  type EditWarning,
  type SessionEditContext,
  type SessionEditFacts,
  type SessionEditInfo,
  type SessionNotFound,
} from '../../shared/sessionEdit.ts'
import {
  applySessionDelete,
  noSessionDeleteInfo,
  type SessionDeleteInfo,
  type SessionDeleter,
} from '../../shared/sessionDelete.ts'
import type { TournamentDefaults } from './squadRow.ts'
import type { Squad } from './types.ts'
import { planSquadEdit, type SquadEditContext, type StoredSquad } from './updatePlan.ts'
import type { UpdateSquad } from './updateRequest.ts'

/** How a create ended (SQD-01 to SQD-08). Only `created` stored anything. */
export type CreateSquadOutcome =
  | { notFound: true }
  /** A complete tournament or a date outside the tournament: 409 with `errors` (D-169, D-171). */
  | { refused: FieldErrors }
  | { created: Squad }

/** How an edit ended (SQD-23 to SQD-25). Only `updated` may have stored anything. */
export type UpdateSquadOutcome =
  | SessionNotFound
  /** The merged lanes pass the last lane: 400 with `errors` (D-179). */
  | { invalid: FieldErrors }
  /** A complete tournament or squad, a date outside, or a stranded bowler: 409 with `errors` (D-181, D-182). */
  | { refused: FieldErrors }
  /** The director must confirm first: 409 with `warnings` (D-180). */
  | { warnings: EditWarning[] }
  | { updated: Squad; changed: (keyof NewSquad)[] }

/** What the create, edit, edit-info, delete, and delete-info routes need from storage. The Prisma version writes the legacy table. */
export interface SquadWriter extends SessionDeleter {
  create(tournamentId: string, input: NewSquad): Promise<CreateSquadOutcome>
  update(
    tournamentId: string,
    squadId: string,
    changes: UpdateSquad,
    options: { confirmWarnings: boolean },
  ): Promise<UpdateSquadOutcome>
  /** What the edit page shows before the director types (D-185). */
  getEditInfo(tournamentId: string, squadId: string): Promise<SessionEditInfo | SessionNotFound>
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

/**
 * The squad as the list reads it after an edit: a cleared fee or ratio shows the tournament's value
 * (TRN-12, D-43, D-183).
 */
export function toEditedSquad(
  id: string,
  complete: boolean,
  stored: StoredSquad,
  defaults: TournamentDefaults,
): Squad {
  return { ...toCreatedSquad(id, stored, defaults), complete }
}

/**
 * Plan an edit and, when it saves, hand the changes to `persist`. Both versions of the writer use
 * this, so the rules live in one place (`planSquadEdit`) and storage only reads and writes.
 */
export async function applyUpdate(
  id: string,
  context: SquadEditContext,
  defaults: TournamentDefaults,
  sent: UpdateSquad,
  confirmWarnings: boolean,
  persist: (changes: UpdateSquad) => Promise<void>,
): Promise<Exclude<UpdateSquadOutcome, SessionNotFound>> {
  const plan = planSquadEdit(context, sent, confirmWarnings)
  switch (plan.kind) {
    case 'invalid':
      return { invalid: plan.errors }
    case 'refused':
      return { refused: plan.errors }
    case 'warn':
      return { warnings: plan.warnings }
    case 'save': {
      const changed = Object.keys(plan.changes) as (keyof NewSquad)[]
      if (changed.length > 0) await persist(plan.changes)
      const stored = { ...context.stored, ...plan.changes }
      return { updated: toEditedSquad(id, context.complete, stored, defaults), changed }
    }
  }
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
    /** Squads that exist before the test starts, for an edit. */
    seed?: { tournamentId: string; squad: Squad }[]
    /** What depends on each squad (entries, scores, assigned lanes), by squad id. */
    editFacts?: Record<string, Partial<SessionEditFacts>>
    /** Per squad id: what the delete rules look at (D-186). */
    deleteInfo?: Record<string, Partial<SessionDeleteInfo>>
  } = {},
) {
  const stored: { tournamentId: string; squad: Squad }[] = (options.seed ?? []).map((entry) => ({
    tournamentId: entry.tournamentId,
    squad: { ...entry.squad },
  }))
  const locate = (
    tournamentId: string,
    squadId: string,
  ): SessionNotFound | { entry: (typeof stored)[number] } => {
    if (options.known && !options.known.includes(tournamentId)) return { notFound: 'tournament' }
    const entry = stored.find((e) => e.tournamentId === tournamentId && e.squad.id === squadId)
    return entry ? { entry } : { notFound: 'session' }
  }
  const writer: SquadWriter = {
    remove: async (tournamentId, squadId) => {
      const found = locate(tournamentId, squadId)
      if (!('entry' in found)) return found
      const { entryCount, scoreCount } = noSessionDeleteInfo(options.deleteInfo?.[squadId])
      return applySessionDelete(
        {
          completed: options.completed?.includes(tournamentId) ?? false,
          complete: found.entry.squad.complete,
          entryCount,
          scoreCount,
        },
        'squad',
        () => {
          stored.splice(stored.indexOf(found.entry), 1)
          return Promise.resolve()
        },
      )
    },
    getDeleteInfo: (tournamentId, squadId) => {
      const found = locate(tournamentId, squadId)
      if (!('entry' in found)) return Promise.resolve(found)
      return Promise.resolve(noSessionDeleteInfo(options.deleteInfo?.[squadId]))
    },
    getEditInfo: (tournamentId, squadId) => {
      const found = locate(tournamentId, squadId)
      if (!('entry' in found)) return Promise.resolve(found)
      return Promise.resolve(
        toSessionEditInfo({ ...noSessionEditFacts, ...options.editFacts?.[squadId] }),
      )
    },
    update: (tournamentId, squadId, changes, { confirmWarnings }) => {
      const found = locate(tournamentId, squadId)
      if (!('entry' in found)) return Promise.resolve(found)
      const { squad } = found.entry
      const defaults = { ...wideOpen, ...options.tournament }
      const current: StoredSquad = {
        date: squad.date,
        startingLane: squad.startingLane,
        numberOfLanes: squad.numberOfLanes,
        maxPerPair: squad.maxPerPair,
        entryFee: squad.entryFeeOverridden ? squad.entryFee : null,
        finalsRatio: squad.finalsRatioOverridden ? squad.finalsRatio : null,
        cashRatio: squad.cashRatioOverridden ? squad.cashRatio : null,
      }
      const context: SquadEditContext = {
        tournament: {
          completed: options.completed?.includes(tournamentId) ?? false,
          startDate: defaults.startDate,
          endDate: defaults.endDate,
        },
        complete: squad.complete,
        stored: current,
        facts: { ...noSessionEditFacts, ...options.editFacts?.[squadId] },
      } satisfies SessionEditContext & { stored: StoredSquad }
      return applyUpdate(squadId, context, defaults, changes, confirmWarnings, () => {
        found.entry.squad = toEditedSquad(
          squadId,
          squad.complete,
          { ...current, ...changes },
          defaults,
        )
        return Promise.resolve()
      })
    },
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
