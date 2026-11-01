import { z } from 'zod'
import { permissions } from '../../shared/auth/permissions.ts'

/** `GET /v1/me`: who the API thinks is calling, and what they may do (D-96). */
export const meSchema = z.object({
  type: z.enum(['anonymous', 'apiKey']),
  permissions: z.array(z.enum(permissions)),
})

export type Me = z.infer<typeof meSchema>
