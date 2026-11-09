import type { BowlerData, BowlerPatch, StoredBowler } from './bowler.ts'
import type { DeskDeleteFacts, DeskDeletePlan } from './deskDelete.ts'
import { isRealPayment, paymentSystem } from './payment.ts'

/** A squad or sweeper row, as the create rules need it (D-108). */
export interface StoredSession {
  id: string
  tournamentId: string
  kind: 'squad' | 'sweeper'
  complete: boolean
  /** Only the desk delete reads these (D-212): the local date and what the entry costs. */
  date?: string
  entryFee?: number
}

/** A registration with the ids of every squad and sweeper on it. */
export interface StoredRegistration {
  id: string
  bowlerId: string
  divisionId: string
  average: number | null
  superSweeper: boolean
  sessionIds: string[]
}

/** What `GET /v1/registrations/{id}` needs (API-06). */
export interface RegistrationDetail extends StoredRegistration {
  tournamentId: string
  bowler: StoredBowler
}

export interface NewPayment {
  id: string
  /** `<system>_<code>` (PAY-02). */
  confirmationCode: string
  amount: number
  createdAtUtc: Date
}

/**
 * Thrown by `save` when the squads and sweepers on the registration are no longer what the desk
 * read: one it adds is already there, or one it removes is gone (D-199). Nothing was written.
 */
export class StaleRegistrationError extends Error {
  constructor() {
    super('The registration changed after it was read.')
  }
}

/** One save: the bowler, the registration, the squads and sweepers added, and the payment. */
export interface SaveRegistration {
  bowler:
    { id: string; isNew: true; data: BowlerData } | { id: string; isNew: false; patch: BowlerPatch }
  registration: {
    id: string
    isNew: boolean
    divisionId: string
    average: number | null
    superSweeper: boolean
  }
  addSessionIds: string[]
  /** Squads and sweepers taken off the registration (REG-31). */
  removeSessionIds?: string[]
  payment: NewPayment | null
  /**
   * The desk's guard (D-199): inside the save, every id in `present` must be on the registration
   * and every id in `absent` must not be, or `save` throws `StaleRegistrationError` and writes
   * nothing. The registration site's calls leave it out.
   */
  expect?: { present: string[]; absent: string[] }
}

/**
 * What the registration write routes need from storage. `save` writes everything or nothing.
 * Reads for the lists and pages stay on `RegistrationRepository`.
 */
export interface RegistrationWriter {
  /** Every bowler with this exact USBC id. More than one means bad data. */
  findBowlersByUsbcId(usbcId: string): Promise<StoredBowler[]>
  /** One bowler by id, or `undefined` (the desk picks a bowler from search, D-157). */
  findBowlerById(id: string): Promise<StoredBowler | undefined>
  /** The bowler's registration in the tournament (REG-01). */
  findRegistration(bowlerId: string, tournamentId: string): Promise<StoredRegistration | undefined>
  /** The tournament a division belongs to, or `undefined` for an unknown division. */
  findDivisionTournament(divisionId: string): Promise<string | undefined>
  findSessions(ids: string[]): Promise<StoredSession[]>
  /** The registration that already holds this payment code (D-109). */
  findRegistrationIdByPaymentCode(confirmationCode: string): Promise<string | undefined>
  /** The ids of the squads and sweepers where this bowler has any score (REG-34, REG-36, REG-15). */
  findScoredSessionIds(bowlerId: string): Promise<string[]>
  save(command: SaveRegistration): Promise<void>
  /** Removes the registration with its squad links and payments. The bowler stays (REG-19). */
  deleteRegistration(registrationId: string): Promise<void>
  /**
   * The facts a desk delete reads (D-211, D-212), or `undefined` for an unknown registration or one
   * of another tournament.
   */
  getDeskDeleteFacts(
    registrationId: string,
    tournamentId: string,
  ): Promise<DeskDeleteFacts | undefined>
  /**
   * The desk delete (D-209 to D-211): in one serializable transaction, read the facts, ask `decide`
   * what to do, and delete the squad entries, payments, and registration only when it says
   * `delete`. Returns what `decide` said, or `undefined` for an unknown registration.
   */
  removeForDesk(
    registrationId: string,
    tournamentId: string,
    decide: (facts: DeskDeleteFacts) => DeskDeletePlan,
  ): Promise<DeskDeletePlan | undefined>
  getDetail(registrationId: string): Promise<RegistrationDetail | undefined>
}

export interface InMemoryWriterSeed {
  bowlers?: StoredBowler[]
  /** A registration, with the tournament its division belongs to. */
  registrations?: { tournamentId: string; registration: StoredRegistration }[]
  divisions?: { id: string; tournamentId: string; name?: string }[]
  /** Tournaments that are complete (D-130); the desk delete reads it. */
  completedTournamentIds?: string[]
  sessions?: StoredSession[]
  payments?: { registrationId: string; confirmationCode: string; amount?: number }[]
  /** A score of one bowler in one squad or sweeper. */
  scores?: { bowlerId: string; sessionId: string }[]
}

/** Storage in memory. `state` lets a test see what was saved. */
export function createInMemoryRegistrationWriter(seed: InMemoryWriterSeed = {}) {
  const state = {
    bowlers: [...(seed.bowlers ?? [])],
    registrations: (seed.registrations ?? []).map((entry) => ({ ...entry })),
    divisions: [...(seed.divisions ?? [])],
    sessions: [...(seed.sessions ?? [])],
    payments: [...(seed.payments ?? [])],
    scores: [...(seed.scores ?? [])],
    completedTournamentIds: [...(seed.completedTournamentIds ?? [])],
  }

  function deskFacts(registrationId: string, tournamentId: string): DeskDeleteFacts | undefined {
    const entry = state.registrations.find((e) => e.registration.id === registrationId)
    const bowler = state.bowlers.find((b) => b.id === entry?.registration.bowlerId)
    if (!entry || !bowler || entry.tournamentId !== tournamentId) return undefined
    const sessions = state.sessions.filter((session) =>
      entry.registration.sessionIds.includes(session.id),
    )
    const scored = new Set(
      state.scores.filter((score) => score.bowlerId === bowler.id).map((s) => s.sessionId),
    )
    return {
      bowlerName: `${bowler.firstName} ${bowler.lastName}`,
      divisionName: state.divisions.find((d) => d.id === entry.registration.divisionId)?.name ?? '',
      tournamentComplete: state.completedTournamentIds.includes(tournamentId),
      hasScores: state.sessions.some(
        (session) => session.tournamentId === tournamentId && scored.has(session.id),
      ),
      entries: sessions.map((session) => ({
        id: session.id,
        kind: session.kind,
        date: session.date ?? '',
        entryFee: session.entryFee ?? 0,
      })),
      payments: state.payments
        .filter(
          (payment) =>
            payment.registrationId === registrationId &&
            isRealPayment(payment.confirmationCode, payment.amount ?? 0),
        )
        .map((payment) => ({
          system: paymentSystem(payment.confirmationCode),
          amount: payment.amount ?? 0,
        })),
    }
  }

  const writer: RegistrationWriter = {
    findBowlersByUsbcId: (usbcId) =>
      Promise.resolve(state.bowlers.filter((bowler) => bowler.usbcId === usbcId)),
    findBowlerById: (id) => Promise.resolve(state.bowlers.find((bowler) => bowler.id === id)),
    findRegistration: (bowlerId, tournamentId) =>
      Promise.resolve(
        state.registrations.find(
          (entry) =>
            entry.registration.bowlerId === bowlerId && entry.tournamentId === tournamentId,
        )?.registration,
      ),
    findDivisionTournament: (divisionId) =>
      Promise.resolve(state.divisions.find((division) => division.id === divisionId)?.tournamentId),
    findSessions: (ids) =>
      Promise.resolve(state.sessions.filter((session) => ids.includes(session.id))),
    findRegistrationIdByPaymentCode: (code) =>
      Promise.resolve(
        state.payments.find((payment) => payment.confirmationCode === code)?.registrationId,
      ),
    findScoredSessionIds: (bowlerId) =>
      Promise.resolve([
        ...new Set(
          state.scores.filter((score) => score.bowlerId === bowlerId).map((s) => s.sessionId),
        ),
      ]),
    save: ({ bowler, registration, addSessionIds, removeSessionIds = [], payment, expect }) => {
      if (expect) {
        const held = state.registrations.find((e) => e.registration.id === registration.id)
          ?.registration.sessionIds
        const isHeld = (id: string) => held?.includes(id) ?? false
        if (!expect.present.every(isHeld) || expect.absent.some(isHeld)) {
          return Promise.reject(new StaleRegistrationError())
        }
      }
      if (bowler.isNew) {
        state.bowlers.push({ id: bowler.id, ...bowler.data })
      } else {
        const stored = state.bowlers.find((candidate) => candidate.id === bowler.id)
        if (stored) Object.assign(stored, bowler.patch)
      }
      const tournamentId = state.divisions.find(
        (d) => d.id === registration.divisionId,
      )?.tournamentId
      if (registration.isNew) {
        state.registrations.push({
          tournamentId: tournamentId ?? '',
          registration: {
            id: registration.id,
            bowlerId: bowler.id,
            divisionId: registration.divisionId,
            average: registration.average,
            superSweeper: registration.superSweeper,
            sessionIds: [...addSessionIds],
          },
        })
      } else {
        const entry = state.registrations.find((e) => e.registration.id === registration.id)
        if (entry) {
          entry.tournamentId = tournamentId ?? entry.tournamentId
          Object.assign(entry.registration, {
            divisionId: registration.divisionId,
            average: registration.average,
            superSweeper: registration.superSweeper,
            sessionIds: [
              ...entry.registration.sessionIds.filter((id) => !removeSessionIds.includes(id)),
              ...addSessionIds,
            ],
          })
        }
      }
      if (payment) {
        state.payments.push({
          registrationId: registration.id,
          confirmationCode: payment.confirmationCode,
        })
      }
      return Promise.resolve()
    },
    deleteRegistration: (registrationId) => {
      state.registrations = state.registrations.filter(
        (entry) => entry.registration.id !== registrationId,
      )
      state.payments = state.payments.filter((payment) => payment.registrationId !== registrationId)
      return Promise.resolve()
    },
    getDeskDeleteFacts: (registrationId, tournamentId) =>
      Promise.resolve(deskFacts(registrationId, tournamentId)),
    removeForDesk: (registrationId, tournamentId, decide) => {
      const facts = deskFacts(registrationId, tournamentId)
      if (!facts) return Promise.resolve(undefined)
      const plan = decide(facts)
      if (plan.kind === 'delete') {
        state.registrations = state.registrations.filter(
          (entry) => entry.registration.id !== registrationId,
        )
        state.payments = state.payments.filter(
          (payment) => payment.registrationId !== registrationId,
        )
      }
      return Promise.resolve(plan)
    },
    getDetail: (registrationId) => {
      const entry = state.registrations.find((e) => e.registration.id === registrationId)
      const bowler = state.bowlers.find((b) => b.id === entry?.registration.bowlerId)
      if (!entry || !bowler) return Promise.resolve(undefined)
      return Promise.resolve({
        ...entry.registration,
        tournamentId: entry.tournamentId,
        bowler: { ...bowler },
      })
    },
  }
  return { writer, state }
}
