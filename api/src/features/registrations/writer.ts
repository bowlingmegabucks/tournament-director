import type { BowlerData, BowlerPatch, StoredBowler } from './bowler.ts'

/** A squad or sweeper row, as the create rules need it (D-108). */
export interface StoredSession {
  id: string
  tournamentId: string
  kind: 'squad' | 'sweeper'
  complete: boolean
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
}

/**
 * What the registration write routes need from storage. `save` writes everything or nothing.
 * Reads for the lists and pages stay on `RegistrationRepository`.
 */
export interface RegistrationWriter {
  /** Every bowler with this exact USBC id. More than one means bad data. */
  findBowlersByUsbcId(usbcId: string): Promise<StoredBowler[]>
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
  getDetail(registrationId: string): Promise<RegistrationDetail | undefined>
}

export interface InMemoryWriterSeed {
  bowlers?: StoredBowler[]
  /** A registration, with the tournament its division belongs to. */
  registrations?: { tournamentId: string; registration: StoredRegistration }[]
  divisions?: { id: string; tournamentId: string }[]
  sessions?: StoredSession[]
  payments?: { registrationId: string; confirmationCode: string }[]
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
  }

  const writer: RegistrationWriter = {
    findBowlersByUsbcId: (usbcId) =>
      Promise.resolve(state.bowlers.filter((bowler) => bowler.usbcId === usbcId)),
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
    save: ({ bowler, registration, addSessionIds, removeSessionIds = [], payment }) => {
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
