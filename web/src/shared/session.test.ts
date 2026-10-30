import { describe, expect, it } from 'vitest'
import { LaneSetupError, retryUnlessFinal, SessionNotFoundError } from './session'

describe('SessionNotFoundError', () => {
  it('names a squad or a sweeper', () => {
    expect(new SessionNotFoundError('squad').message).toBe('Squad not found')
    expect(new SessionNotFoundError('sweeper').message).toBe('Sweeper not found')
  })
})

describe('retryUnlessFinal', () => {
  it('retries a failure once', () => {
    expect(retryUnlessFinal(0, new Error('down'))).toBe(true)
    expect(retryUnlessFinal(1, new Error('down'))).toBe(false)
  })

  it('does not retry a missing session', () => {
    expect(retryUnlessFinal(0, new SessionNotFoundError('squad'))).toBe(false)
  })

  it('does not retry a session that cannot take lanes', () => {
    expect(retryUnlessFinal(0, new LaneSetupError('Bowlers per pair must be 2 to 5'))).toBe(false)
  })
})
