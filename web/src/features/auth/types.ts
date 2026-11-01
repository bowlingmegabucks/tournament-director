/** Permissions the web app asks about. The API may send others; `Me` keeps them as plain strings. */
export type KnownPermission =
  | 'registrations.read'
  | 'registrations.write'
  | 'lanes.read'
  | 'lanes.assign'
  | 'scores.write'
  | 'sessions.complete'
  | 'tournaments.write'
  | 'bowlers.ssn'
  | 'users.manage'

export interface SignedInUser {
  id: string
  email: string
  name: string
  roles: string[]
  /** The complete list from the API. The web app never keeps its own (D-96). */
  permissions: string[]
}

/** The answer to `GET /v1/me`. `user` is null when nobody is signed in. */
export interface Me {
  user: SignedInUser | null
}
