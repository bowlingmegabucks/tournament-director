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

  describe('redaction (SEC-13, D-265)', () => {
    it.each(['ssn', 'socialSecurityNumber', 'encryptionKey'])(
      'hides %s at the top level and one level down',
      (field) => {
        const { logger, records } = createCapturedLogger('info')

        logger.info(
          { [field]: '123456789', bowler: { [field]: '123456789', name: 'Ada' } },
          'saved',
        )

        const [record] = records()
        expect(record).toMatchObject({
          [field]: '[Redacted]',
          bowler: { [field]: '[Redacted]', name: 'Ada' },
        })
        expect(JSON.stringify(record)).not.toContain('123456789')
      },
    )

    it('hides the fields on a child logger too', () => {
      const { logger, records } = createCapturedLogger('info')

      logger.child({ requestId: 'r1' }).info({ ssn: '123456789', count: 2 }, 'saved')

      expect(records()).toMatchObject([{ requestId: 'r1', ssn: '[Redacted]', count: 2 }])
    })

    it('leaves other fields alone', () => {
      const { logger, records } = createCapturedLogger('info')

      logger.info({ registrationId: 'abc', count: 3 }, 'saved')

      expect(records()).toMatchObject([{ registrationId: 'abc', count: 3 }])
    })
  })
})
