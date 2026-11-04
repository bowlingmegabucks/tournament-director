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
 * An HttpError that carries warnings: the change is allowed, but nothing was saved until the caller
 * confirms (D-129). The error handler sends `{ message, warnings }`.
 */
export class WarningsError extends HttpError {
  readonly warnings: { field: string; message: string }[]

  constructor(status: number, message: string, warnings: { field: string; message: string }[]) {
    super(status, message)
    this.warnings = warnings
  }
}
