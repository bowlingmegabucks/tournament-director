import { describe, expect, it } from 'vitest'
import { HttpError } from '../../shared/errors.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { compareText, reportSkipped, requireRatios } from './resultHelpers.ts'

describe('compareText', () => {
  it('ignores case and accents (BWL-14)', () => {
    expect(compareText('José', 'jose')).toBe(0)
    expect(compareText('ABE', 'abe')).toBe(0)
  })

  it('orders by letter', () => {
    expect(compareText('Adams', 'Baker')).toBeLessThan(0)
    expect(compareText('Baker', 'Adams')).toBeGreaterThan(0)
  })
})

describe('requireRatios', () => {
  it('accepts ratios above zero', () => {
    expect(() => requireRatios('Tournament', { finals: 1, cash: 0.5 })).not.toThrow()
  })

  it.each([0, -1])('refuses a ratio of %d with a 422 that names it (D-83)', (value) => {
    let thrown: unknown
    try {
      requireRatios('Tournament', { finals: 7, cash: value })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(HttpError)
    expect((thrown as HttpError).status).toBe(422)
    expect((thrown as HttpError).message).toBe(
      `Tournament cash ratio is ${value}, so results cannot be worked out. Set a ratio of 1 or more.`,
    )
  })
})

describe('reportSkipped', () => {
  it('warns once for each skipped registration, with the session id (D-51)', () => {
    const { logger, records } = createCapturedLogger()
    const reporting = { logger, reported: new Set<string>() }

    reportSkipped(reporting, 'squad-1', ['reg-1', 'reg-2'])

    expect(records()).toEqual([
      expect.objectContaining({
        level: 40,
        registrationId: 'reg-1',
        sessionId: 'squad-1',
        msg: 'Skipped a result entry whose division is not in this tournament',
      }),
      expect.objectContaining({ registrationId: 'reg-2', sessionId: 'squad-1' }),
    ])
  })

  it('does not warn again for the same session and registration', () => {
    const { logger, records } = createCapturedLogger()
    const reporting = { logger, reported: new Set<string>() }

    reportSkipped(reporting, 'squad-1', ['reg-1'])
    reportSkipped(reporting, 'squad-1', ['reg-1'])
    reportSkipped(reporting, 'squad-2', ['reg-1'])

    expect(records()).toHaveLength(2)
  })

  it('logs nothing when nothing was skipped', () => {
    const { logger, records } = createCapturedLogger()

    reportSkipped({ logger, reported: new Set<string>() }, 'squad-1', [])

    expect(records()).toEqual([])
  })
})
