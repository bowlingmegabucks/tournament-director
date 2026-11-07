/** Throw from any handler to send a specific status. Anything else becomes a 500. */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * An HttpError that also names what is wrong with each field, for a form to show under the right
 * input (D-121). The error handler sends `{ message, errors }`.
 */
export class FieldErrorsError extends HttpError {
  readonly errors: Record<string, string>

  constructor(status: number, message: string, errors: Record<string, string>) {
    super(status, message)
    this.errors = errors
  }
}

/**
 * An HttpError that carries what the caller needs to settle a conflict: the desk asks the user,
 * then sends the request again (D-159, D-161). The error handler sends `{ message, ...body }`.
 */
export class ConflictError extends HttpError {
  readonly body: Record<string, unknown>

  constructor(message: string, body: Record<string, unknown>) {
    super(409, message)
    this.body = body
  }
}

/**
 * An HttpError that carries warnings: the change is allowed, but nothing was saved until the caller
 * confirms (D-129). The error handler sends `{ message, warnings }`.
 */
export class WarningsError extends HttpError {
  readonly warnings: { field: string; message: string }[]
  /** More fields for the response body, next to `message` and `warnings`. */
  readonly extra: Record<string, unknown>

  constructor(
    status: number,
    message: string,
    warnings: { field: string; message: string }[],
    extra: Record<string, unknown> = {},
  ) {
    super(status, message)
    this.warnings = warnings
    this.extra = extra
  }
}
