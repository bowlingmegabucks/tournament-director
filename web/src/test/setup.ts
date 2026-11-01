import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setMockUser } from '../mocks/authHandlers'
import { server } from '../mocks/server'

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

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  setMockUser(null)
  server.resetHandlers()
})
afterAll(() => server.close())
