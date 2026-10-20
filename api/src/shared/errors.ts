/** Throw from any handler to send a specific status. Anything else becomes a 500. */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
