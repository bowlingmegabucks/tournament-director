/**
 * A stand-in for the browser's `EventSource`, for unit tests. jsdom has none, and MSW intercepts
 * server-sent events in the browser only, so a test opens, drops, and sends by hand. (It is not a
 * stand-in for `fetch`: the network rule still holds.)
 */
export class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  /** Every stream the page under test opened, oldest first, and not yet cleared. */
  static readonly instances: FakeEventSource[] = []

  readonly url: string
  readonly withCredentials: boolean
  readyState: number = FakeEventSource.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  private readonly listeners = new Map<string, ((event: MessageEvent) => void)[]>()

  constructor(url: string | URL, init?: { withCredentials?: boolean }) {
    this.url = String(url)
    this.withCredentials = init?.withCredentials ?? false
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED
  }

  /** The connection came up (the first time, or after a drop). */
  open(): void {
    this.readyState = FakeEventSource.OPEN
    this.onopen?.(new Event('open'))
  }

  /** The server sent a message. Defaults to what the API sends (D-218). */
  message(data: string = '{"kind":"lanes","version":1}', type = 'changed'): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data }))
    }
  }

  /** The connection dropped. `giveUp` is what the browser does after a 401 or 403: it stops retrying. */
  fail(giveUp = false): void {
    this.readyState = giveUp ? FakeEventSource.CLOSED : FakeEventSource.CONNECTING
    this.onerror?.(new Event('error'))
  }

  static reset(): void {
    FakeEventSource.instances.length = 0
  }

  /** The newest stream. Throws when the page opened none. */
  static latest(): FakeEventSource {
    const latest = FakeEventSource.instances.at(-1)
    if (!latest) throw new Error('The page opened no event stream')
    return latest
  }
}
