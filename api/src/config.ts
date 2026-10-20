import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Comma-separated list. Empty means same-origin only.
  CORS_ORIGIN: z.string().default(''),
})

export interface Config {
  port: number
  corsOrigins: string[]
}

/** Read and validate the environment once, at startup. Throws with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`)
  }
  return {
    port: result.data.PORT,
    corsOrigins: result.data.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
  }
}
