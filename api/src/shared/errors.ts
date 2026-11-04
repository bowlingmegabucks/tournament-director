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
