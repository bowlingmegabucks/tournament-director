/**
 * What `GET /v1/tournaments/{id}/registrations` returns for one registration (REG-23, REG-26,
 * D-47). The API's `features/registrations/types.ts` has the same fields: change both together.
 */
export interface Registration {
  id: string
  bowler: {
    id: string
    /** `First Last`, plus `, Suffix` (BWL-13). */
    name: string
    firstName: string
    lastName: string
    /** `''` when the bowler has none. */
    usbcId: string
  }
  divisionId: string
  divisionName: string
  /** The qualifying squads and sweepers entered. The page shows the counts and lists them in a popup (REG-28). */
  squadIds: string[]
  sweeperIds: string[]
  superSweeper: boolean
}

/** Counts for the whole tournament, not the filtered rows (REG-24, D-50). */
export interface Summary {
  registrations: number
  superSweepers: number
  /** Squads entered by the bowlers in the division. Sweepers do not count (REG-24). */
  divisions: { id: string; number: number; name: string; entries: number }[]
  squads: SessionEntries[]
  sweepers: SessionEntries[]
}

/** A squad or sweeper with its date and status, for the popup (REG-28). */
export interface SessionEntries {
  id: string
  date: string
  complete: boolean
  entries: number
}

export interface RegistrationList {
  registrations: Registration[]
  summary: Summary
}

/** One bowler in the desk search (BWL-14, D-157). The API's `features/bowlers/types.ts` has the same fields: change both together. */
export interface BowlerSearchResult {
  id: string
  /** `First Last`, plus `, Suffix` (BWL-13). */
  name: string
  firstName: string
  lastName: string
  /** `''` when the bowler has none. */
  usbcId: string
  city: string
  state: string
  /** The division of the bowler's registration in this tournament, or `null`. */
  registered: { divisionName: string } | null
}

export interface BowlerSearch {
  bowlers: BowlerSearchResult[]
  /** More than 25 matched and the list was cut. */
  more: boolean
}

/** The fields the form shows and edits. All text, so a box can hold what the desk typed (D-158). No SSN (BWL-17). */
export interface BowlerValues {
  firstName: string
  middleInitial: string
  lastName: string
  suffix: string
  street: string
  city: string
  state: string
  zipCode: string
  email: string
  phoneNumber: string
  usbcId: string
  /** `YYYY-MM-DD` or `''`. */
  dateOfBirth: string
  gender: '' | 'Male' | 'Female'
}

/** The bowler's registration in the tournament in the URL (REG-01, D-165). */
export interface BowlerRegistration {
  id: string
  divisionId: string
  divisionName: string
  average: number | null
  superSweeper: boolean
  squadIds: string[]
  sweeperIds: string[]
  /** Any score in this tournament: a division move is refused (D-160). */
  hasScores: boolean
}

/** `GET /v1/bowlers/{id}?tournamentId=`. */
export interface BowlerResponse {
  bowler: BowlerValues & { id: string }
  registration: BowlerRegistration | null
}

/** `POST /v1/tournaments/{id}/registrations` (D-157). */
export interface DeskRegistrationRequest {
  divisionId: string
  average: number | null
  squadIds: string[]
  sweeperIds: string[]
  superSweeper: boolean
  /** A stored bowler; `bowler` is then only what changed. */
  bowlerId?: string
  bowler: Partial<BowlerValues>
  appendToExisting?: boolean
}

export interface DeskResult {
  registrationId: string
  mode: 'created' | 'appended'
}

/** The first message per form field, keyed by path (`bowler.email`, `squadIds`, `form`). */
export type DeskFieldErrors = Record<string, string>

/** What the desk is told when the bowler is already registered here (D-159). */
export interface ExistingRegistration {
  registrationId: string
  divisionId: string
  divisionName: string
  squadIds: string[]
  sweeperIds: string[]
}

/** `GET /v1/tournaments/{id}/registrations/{registrationId}/edit-info` (D-197). The API's `editRoutes.ts` sends these fields: change both together. */
export interface EditInfo {
  bowler: BowlerValues & { id: string }
  registration: {
    id: string
    divisionId: string
    average: number | null
    superSweeper: boolean
    squadIds: string[]
    sweeperIds: string[]
  }
  locks: {
    /** Sessions where this bowler has a score: they cannot be removed (REG-34). */
    scoredSessionIds: string[]
    /** Any score in this tournament: the division is locked (REG-15). */
    hasScores: boolean
    /** A sweeper score: super sweeper is locked (REG-18, D-110). */
    hasSweeperScores: boolean
  }
}

/** `PATCH /v1/tournaments/{id}/registrations/{registrationId}` (D-197, D-199). Every part is optional. */
export interface EditRegistrationRequest {
  divisionId?: string
  /** `null` clears it (REG-16). */
  average?: number | null
  superSweeper?: boolean
  addSquadIds?: string[]
  removeSquadIds?: string[]
  addSweeperIds?: string[]
  removeSweeperIds?: string[]
  /** Only the changed fields; an empty string clears one (D-206). */
  bowler?: Partial<BowlerValues>
  confirmWarnings?: boolean
}

export interface EditResult {
  registrationId: string
  added: number
  removed: number
}

/** What the API asks the director to confirm before it saves (D-201). */
export interface EditWarning {
  field: string
  message: string
}
