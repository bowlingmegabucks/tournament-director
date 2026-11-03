import { z } from 'zod'
import { maxPasswordLength, minPasswordLength } from '../../shared/auth/createAuth.ts'

/**
 * `POST /v1/account/password`. The current password is checked by Better Auth, so it only needs a
 * sane length here. The new one follows the same 12 to 128 rule as every other way to set one.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(maxPasswordLength),
  newPassword: z.string().min(minPasswordLength).max(maxPasswordLength),
})

/**
 * `PATCH /v1/account`: the signed-in user edits their own profile. Only `name`, and `.strict()`
 * refuses any other field, so a body with `role` or `banned` is a 400 and never reaches Better
 * Auth's `updateUser`. The name rule matches `USR-02`.
 */
export const updateProfileSchema = z.strictObject({ name: z.string().trim().min(1).max(100) })

/** `PATCH /v1/account` answers with the saved name. */
export interface Profile {
  name: string
}
