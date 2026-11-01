import { z } from 'zod'

/**
 * `GET /v1/me`: whether the request carried a valid API key, and who is signed in (D-96).
 * One request can carry both. `user` stays `null` until sign-in arrives (stage 2).
 */
export const meSchema = z.object({
  apiKey: z.boolean(),
  user: z.null(),
})

export type Me = z.infer<typeof meSchema>
