import { z } from 'zod'
import { roleNames } from '../../shared/auth/roles.ts'

/**
 * `POST /v1/users`: add a user and email them a set-password link (D-101). At least one role,
 * picked from the list (D-103). The admin never types or sees a password.
 */
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  name: z.string().trim().min(1).max(100),
  roles: z
    .array(z.enum(roleNames))
    .min(1, 'pick at least one role')
    .transform((roles) => [...new Set(roles)]),
})

export type CreateUserRequest = z.infer<typeof createUserSchema>

/** `GET /v1/users/options`: what the create-user page needs to draw itself (D-103). */
export interface UserOptions {
  /** Every role a user can hold, from `roles.ts`. The web app keeps no list of its own. */
  roles: readonly string[]
  /** Whether the API can send the invite. When `false`, `POST /v1/users` answers 503. */
  inviteEmail: boolean
}

/** `POST /v1/users` answers 201 with the new user. No password, no token. */
export interface CreatedUser {
  id: string
  email: string
  name: string
  roles: string[]
}

/** One row of `GET /v1/users`. Named field by field: nothing else about a user is sent. */
export interface ListedUser {
  id: string
  email: string
  name: string
  roles: string[]
  /** True when an admin has disabled the account. */
  disabled: boolean
}
