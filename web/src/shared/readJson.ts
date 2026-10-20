/** Parse a response body as JSON. Reject with `<failure> (response is not JSON)` if it is not. */
export async function readJson(response: Response, failure: string): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new Error(`${failure} (response is not JSON)`)
  }
}
