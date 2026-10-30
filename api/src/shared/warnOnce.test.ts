import { describe, expect, it } from 'vitest'
import { createCapturedLogger } from '../test/logger.ts'
import { MAX_REPORTED, warnOnce } from './warnOnce.ts'

describe('warnOnce', () => {
  it('logs a key the first time only', () => {
    const { logger, records } = createCapturedLogger()
    const reported = new Set<string>()

    warnOnce(reported, 'a', logger, { id: 1 }, 'Bad row')
    warnOnce(reported, 'a', logger, { id: 1 }, 'Bad row')

    expect(records()).toHaveLength(1)
    expect(records()[0]).toMatchObject({ level: 40, msg: 'Bad row', id: 1 })
  })

  it('logs each different key', () => {
    const { logger, records } = createCapturedLogger()
    const reported = new Set<string>()

    warnOnce(reported, 'a', logger, {}, 'Bad row')
    warnOnce(reported, 'b', logger, {}, 'Bad row')

    expect(records()).toHaveLength(2)
  })

  it('starts over at the cap so the set stays small', () => {
    const { logger, records } = createCapturedLogger()
    const reported = new Set(Array.from({ length: MAX_REPORTED }, (_, index) => `old${index}`))

    warnOnce(reported, 'new', logger, {}, 'Bad row')

    expect([...reported]).toEqual(['new'])
    expect(records()).toHaveLength(1)
  })

  it('keeps the set below the cap when it still has room', () => {
    const { logger } = createCapturedLogger()
    const reported = new Set(Array.from({ length: MAX_REPORTED - 1 }, (_, index) => `old${index}`))

    warnOnce(reported, 'new', logger, {}, 'Bad row')

    expect(reported.size).toBe(MAX_REPORTED)
  })
})
