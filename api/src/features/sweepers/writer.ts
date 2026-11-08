import { randomUUID } from 'node:crypto'
import { planCreate, type CreateFacts } from './createPlan.ts'
import type { FieldErrors, NewSweeper } from './createRequest.ts'
import {
  noSessionEditFacts,
  toSessionEditInfo,
  type EditWarning,
  type SessionEditFacts,
  type SessionEditInfo,
  type SessionNotFound,
} from '../../shared/sessionEdit.ts'
import type { Sweeper } from './types.ts'
import { planSweeperEdit, type StoredSweeper, type SweeperEditContext } from './updatePlan.ts'
import type { UpdateSweeper } from './updateRequest.ts'

/** How a create ended (SQD-10 to SQD-13). Only `created` stored anything. */
export type CreateSweeperOutcome =
  | { notFound: true }
  /** A complete tournament, a date outside it, or a gone division: 409 with `errors` (D-169, D-171, D-177). */
  | { refused: FieldErrors }
  | { created: Sweeper }

/** How an edit ended (SQD-23 to SQD-25, SQD-29). Only `updated` may have stored anything. */
export type UpdateSweeperOutcome =
  | SessionNotFound
  /** The merged lanes pass the last lane: 400 with `errors` (D-179). */
  | { invalid: FieldErrors }
  /** A complete tournament or sweeper, a date outside, games with scores, a stranded bowler, or a gone division: 409 with `errors`. */
  | { refused: FieldErrors }
  /** The director must confirm first: 409 with `warnings` (D-180). */
  | { warnings: EditWarning[] }
  | { updated: Sweeper; changed: (keyof NewSweeper)[] }

/** What the create, edit, and edit-info routes need from storage. The Prisma version writes the legacy tables. */
export interface SweeperWriter {
  create(tournamentId: string, input: NewSweeper): Promise<CreateSweeperOutcome>
  update(
    tournamentId: string,
    sweeperId: string,
    changes: UpdateSweeper,
    options: { confirmWarnings: boolean },
  ): Promise<UpdateSweeperOutcome>
  /** What the edit page shows before the director types (D-185). */
  getEditInfo(tournamentId: string, sweeperId: string): Promise<SessionEditInfo | SessionNotFound>
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

/** The stored pins with a division's edit applied: 0 removes it (D-184). */
export function mergePins(
  stored: Record<string, number>,
  changes: Record<string, number> | undefined,
): Record<string, number> {
  const merged = { ...stored, ...changes }
  return Object.fromEntries(Object.entries(merged).filter(([, pins]) => pins !== 0))
}

/** The sweeper as the list reads it after an edit. */
export function toEditedSweeper(
  id: string,
  complete: boolean,
  stored: StoredSweeper,
  divisions: readonly DivisionName[],
): Sweeper {
  return { ...toCreatedSweeper(id, stored, divisions), complete }
}

/**
 * Plan an edit and, when it saves, hand the changes to `persist`. Both versions of the writer use
 * this, so the rules live in one place (`planSweeperEdit`) and storage only reads and writes.
 */
export async function applyUpdate(
  id: string,
  context: SweeperEditContext,
  divisions: readonly DivisionName[],
  sent: UpdateSweeper,
  confirmWarnings: boolean,
  persist: (changes: UpdateSweeper) => Promise<void>,
): Promise<Exclude<UpdateSweeperOutcome, SessionNotFound>> {
  const plan = planSweeperEdit(context, sent, confirmWarnings)
  switch (plan.kind) {
    case 'invalid':
      return { invalid: plan.errors }
    case 'refused':
      return { refused: plan.errors }
    case 'warn':
      return { warnings: plan.warnings }
    case 'save': {
      const changed = Object.keys(plan.changes) as (keyof NewSweeper)[]
      if (changed.length > 0) await persist(plan.changes)
      const stored: StoredSweeper = {
        ...context.stored,
        ...plan.changes,
        bonusPins: mergePins(context.stored.bonusPins, plan.changes.bonusPins),
      }
      return { updated: toEditedSweeper(id, context.complete, stored, divisions), changed }
    }
  }
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
    /** Sweepers that exist before the test starts, for an edit. */
    seed?: { tournamentId: string; sweeper: Sweeper }[]
    /** What depends on each sweeper (entries, scores, assigned lanes), by sweeper id. */
    editFacts?: Record<string, Partial<SessionEditFacts>>
  } = {},
) {
  const stored: { tournamentId: string; sweeper: Sweeper }[] = (options.seed ?? []).map(
    (entry) => ({ tournamentId: entry.tournamentId, sweeper: { ...entry.sweeper } }),
  )
  const locate = (
    tournamentId: string,
    sweeperId: string,
  ): SessionNotFound | { entry: (typeof stored)[number] } => {
    if (options.known && !options.known.includes(tournamentId)) return { notFound: 'tournament' }
    const entry = stored.find((e) => e.tournamentId === tournamentId && e.sweeper.id === sweeperId)
    return entry ? { entry } : { notFound: 'session' }
  }
  const writer: SweeperWriter = {
    getEditInfo: (tournamentId, sweeperId) => {
      const found = locate(tournamentId, sweeperId)
      if (!('entry' in found)) return Promise.resolve(found)
      return Promise.resolve(
        toSessionEditInfo({ ...noSessionEditFacts, ...options.editFacts?.[sweeperId] }),
      )
    },
    update: (tournamentId, sweeperId, changes, { confirmWarnings }) => {
      const found = locate(tournamentId, sweeperId)
      if (!('entry' in found)) return Promise.resolve(found)
      const { sweeper } = found.entry
      // Without a list, every division the sweeper lists or the request names is known.
      const divisions: DivisionName[] =
        options.divisions ??
        [
          ...new Set([
            ...sweeper.bonusPins.map((pin) => pin.divisionId),
            ...Object.keys(changes.bonusPins ?? {}),
          ]),
        ].map((id, index) => ({
          id,
          name: sweeper.bonusPins.find((pin) => pin.divisionId === id)?.divisionName ?? id,
          // Stryker disable next-line ArithmeticOperator: the number only orders the divisions.
          number: index + 1,
        }))
      const current: StoredSweeper = {
        date: sweeper.date,
        startingLane: sweeper.startingLane,
        numberOfLanes: sweeper.numberOfLanes,
        maxPerPair: sweeper.maxPerPair,
        entryFee: sweeper.entryFee,
        games: sweeper.games,
        cashRatio: sweeper.cashRatio,
        bonusPins: Object.fromEntries(
          sweeper.bonusPins.map((pin) => [pin.divisionId, pin.bonusPinsPerGame]),
        ),
      }
      const context: SweeperEditContext = {
        tournament: {
          completed: options.completed?.includes(tournamentId) ?? false,
          // Stryker disable next-line StringLiteral: an empty start date is before no day, the same as 2000-01-01.
          startDate: options.dates?.startDate ?? '2000-01-01',
          endDate: options.dates?.endDate ?? '2099-12-31',
        },
        complete: sweeper.complete,
        stored: current,
        facts: { ...noSessionEditFacts, ...options.editFacts?.[sweeperId] },
        divisions,
      }
      return applyUpdate(sweeperId, context, divisions, changes, confirmWarnings, () => {
        found.entry.sweeper = toEditedSweeper(
          sweeperId,
          sweeper.complete,
          {
            ...current,
            ...changes,
            bonusPins: mergePins(current.bonusPins, changes.bonusPins),
          },
          divisions,
        )
        return Promise.resolve()
      })
    },
    create: (tournamentId, input) => {
      if (options.known && !options.known.includes(tournamentId)) {
        return Promise.resolve({ notFound: true })
      }
      const divisions =
        options.divisions ??
        // Stryker disable next-line ArithmeticOperator: the number only orders the divisions, and the route tests name one at a time or none out of order.
        Object.keys(input.bonusPins).map((id, index) => ({ id, name: id, number: index + 1 }))
      const facts: CreateFacts = {
        completed: options.completed?.includes(tournamentId) ?? false,
        // Stryker disable next-line StringLiteral: an empty start date is before no day, the same as 2000-01-01.
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
