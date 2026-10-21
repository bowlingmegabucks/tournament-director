import { describe, expect, it } from 'vitest'
import { createCapturedLogger } from '../test/logger.ts'

describe('createLogger', () => {
  it('writes one JSON line with the service name', () => {
    const { logger, records } = createCapturedLogger('info')

    logger.info({ port: 3000 }, 'API listening')

    expect(records()).toMatchObject([
      { level: 30, service: 'test-api', port: 3000, msg: 'API listening' },
    ])
  })

  it('skips lines below the configured level', () => {
    const { logger, records } = createCapturedLogger('warn')

    logger.info('quiet')
    logger.warn('loud')

    expect(records()).toHaveLength(1)
  })

  it('writes nothing at the silent level', () => {
    const { logger, records } = createCapturedLogger('silent')

    logger.fatal('even this')

    expect(records()).toEqual([])
  })
})
