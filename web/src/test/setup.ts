import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setMockUser } from '../mocks/authHandlers'
import { server } from '../mocks/server'
import { resetMockLaneMoves } from '../mocks/handlers'
import { FakeEventSource } from './fakeEventSource'

// jsdom has no <dialog>.showModal or close. This stand-in opens and closes it and fires "close",
// which is enough for unit tests. Escape, the backdrop, and focus return are checked in e2e.
HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close() {
  if (!this.hasAttribute('open')) return
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
  // jsdom has no EventSource (LAN-19); the lane page opens one.
  vi.stubGlobal('EventSource', FakeEventSource)
})
afterEach(() => {
  cleanup()
  setMockUser(null)
  FakeEventSource.reset()
  resetMockLaneMoves()
  server.resetHandlers()
})
afterAll(() => server.close())
