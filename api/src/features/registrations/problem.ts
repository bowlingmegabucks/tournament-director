import { z } from 'zod'

/** One reason a registration request failed (`API-12`). */
export const problemErrorSchema = z.object({ code: z.string(), description: z.string() })

export type ProblemError = z.infer<typeof problemErrorSchema>

/**
 * A reason plus its kind. Legacy answers 400 when any reason is a validation error and 500
 * otherwise, even for "not found" and conflicts (`API-12`, kept under D-09).
 */
export interface Failure extends ProblemError {
  kind: 'validation' | 'other'
}

export function validation(code: string, description: string): Failure {
  return { kind: 'validation', code, description }
}

export function other(code: string, description: string): Failure {
  return { kind: 'other', code, description }
}

/**
 * The legacy problem details body (`application/problem+json`): `status`, `detail`, `errors`, and
 * `traceId`. `message` is ours, so the web app reads one field on every route.
 */
export const problemSchema = z.object({
  status: z.number().int(),
  detail: z.string(),
  errors: z.array(problemErrorSchema).optional(),
  traceId: z.string(),
  message: z.string(),
})

export type Problem = z.infer<typeof problemSchema>

export function toProblem(failures: Failure[], detail: string, traceId: string): Problem {
  const status = failures.some((failure) => failure.kind === 'validation') ? 400 : 500
  return {
    status,
    detail,
    errors: failures.map(({ code, description }) => ({ code, description })),
    traceId,
    message: failures.map((failure) => failure.description).join(' '),
  }
}

/** The 404 body legacy sends for an unknown registration. */
export function notFoundProblem(traceId: string): Problem {
  return { status: 404, detail: 'Resource not found', traceId, message: 'Registration not found' }
}
