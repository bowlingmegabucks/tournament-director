/** `GET /v1/users/options`: what the add-user page needs to draw itself. */
export interface UserOptions {
  /** Every role a user can hold. The API owns the list (D-96, D-103). */
  roles: string[]
  /** False when the API has no mail settings: then no user can be added. */
  inviteEmail: boolean
}

export interface NewUser {
  email: string
  name: string
  roles: string[]
}

/** The user the API made. It carries no password. */
export interface CreatedUser {
  id: string
  email: string
  name: string
  roles: string[]
}

/** One row of `GET /v1/users`. */
export interface ListedUser {
  id: string
  email: string
  name: string
  roles: string[]
  /** True when an admin has disabled the account. */
  disabled: boolean
}
