import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Opens a server-sent event stream on a real socket and reads it, for the tests of the stream
 * routes. Call `closeAll` in `afterEach`: an open stream never ends on its own.
 */
export function createStreamReader() {
  const servers: Server[] = []
  const controllers: AbortController[] = []

  async function closeAll() {
    for (const controller of controllers.splice(0)) controller.abort()
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections()
            server.close(() => {
              resolve()
            })
          }),
      ),
    )
  }

  /** Open the stream and read until `needle` shows; `untilText` reads on to another text. */
  async function readStream(app: Parameters<typeof createServer>[1], url: string, needle: string) {
    const server = createServer(app)
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const controller = new AbortController()
    controllers.push(controller)
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}${url}`,
      { signal: controller.signal },
    )
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let text = ''
    async function until(target: string) {
      while (!text.includes(target)) {
        const chunk = await reader?.read()
        if (!chunk || chunk.done) break
        text += decoder.decode(chunk.value)
      }
      return text
    }
    return { response, until: () => until(needle), untilText: until }
  }

  return { readStream, closeAll }
}
