import { z } from 'zod'
import { permissions } from '../../shared/auth/permissions.ts'
import { roleNames } from '../../shared/auth/roles.ts'

/** Who is signed in. The email is their own; it is shown to them and nobody else. */
export const meUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  /** Zero or more. A user with none can sign in and do nothing. */
  roles: z.array(z.enum(roleNames)),
  /** Everything the roles allow, so the web app never keeps its own list (D-96, D-102). */
  permissions: z.array(z.enum(permissions)),
})

/**
 * `GET /v1/me`: whether the request carried a valid API key, and who is signed in (D-96).
 * One request can carry both. `user` is `null` when no one is signed in.
 */
export const meSchema = z.object({
  apiKey: z.boolean(),
  user: meUserSchema.nullable(),
})

export type Me = z.infer<typeof meSchema>
