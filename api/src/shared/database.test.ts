import { describe, expect, it } from 'vitest'
import { createCapturedLogger } from '../test/logger.ts'
import { isDatabaseUnavailable, withConnectionDefaults, withDatabaseErrors } from './database.ts'
import { HttpError } from './errors.ts'

describe('withConnectionDefaults', () => {
  it('adds short timeouts and keeps the rest of the URL', () => {
    const url = new URL(withConnectionDefaults('mariadb://megabucks:p%40ss@db.example:3306/legacy'))

    expect(url.username).toBe('megabucks')
    expect(url.password).toBe('p%40ss')
    expect(url.host).toBe('db.example:3306')
    expect(url.pathname).toBe('/legacy')
    expect(url.searchParams.get('connectTimeout')).toBe('2000')
    expect(url.searchParams.get('acquireTimeout')).toBe('2000')
  })

  it('keeps a timeout the URL already sets', () => {
    const url = new URL(
      withConnectionDefaults('mariadb://u:p@host/db?connectTimeout=9000&ssl=true'),
    )

    expect(url.searchParams.get('connectTimeout')).toBe('9000')
    expect(url.searchParams.get('acquireTimeout')).toBe('2000')
    expect(url.searchParams.get('ssl')).toBe('true')
  })
})

describe('isDatabaseUnavailable', () => {
  it.each(['P2039', 'P2024', 'P1001', 'P1002', 'P1008', 'P1017'])(
    'is true for %s (D-32)',
    (code) => {
      expect(isDatabaseUnavailable({ code })).toBe(true)
    },
  )

  it('is true for a raw query that lost its connection (P2010 with driver code 45028)', () => {
    const error = { code: 'P2010', meta: { driverAdapterError: { cause: { code: 45028 } } } }

    expect(isDatabaseUnavailable(error)).toBe(true)
  })

  it.each([
    [
      'a raw query that failed for another reason',
      { code: 'P2010', meta: { driverAdapterError: { cause: { code: 1064 } } } },
    ],
    [
      'another code with the same driver detail',
      { code: 'P2021', meta: { driverAdapterError: { cause: { code: 45028 } } } },
    ],
    ['a raw query with no driver detail', { code: 'P2010' }],
    ['a raw query with no cause', { code: 'P2010', meta: { driverAdapterError: {} } }],
    ['a raw query with empty meta', { code: 'P2010', meta: {} }],
    ['a missing table', { code: 'P2021' }],
    ['an error with no code', new Error('boom')],
    ['a code that is not text', { code: 2039 }],
    ['null', null],
    ['text', 'P2039'],
  ])('is false for %s', (_label, error) => {
    expect(isDatabaseUnavailable(error)).toBe(false)
  })
})

describe('withDatabaseErrors', () => {
  it('returns what the call returns', async () => {
    const { logger } = createCapturedLogger()

    await expect(withDatabaseErrors(logger, () => Promise.resolve(42))).resolves.toBe(42)
  })

  it('turns an unreachable database into a 503 and logs the cause (D-32)', async () => {
    const { logger, records } = createCapturedLogger()
    const cause = Object.assign(new Error('pool failed'), { code: 'P2039' })

    const failure = await withDatabaseErrors(logger, () => Promise.reject(cause)).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(HttpError)
    expect(failure).toMatchObject({ status: 503, message: 'Database unavailable' })
    expect(records()).toMatchObject([
      { level: 50, msg: 'Database unavailable', err: { message: 'pool failed' } },
    ])
  })

  it('lets any other error through unchanged', async () => {
    const { logger, records } = createCapturedLogger()
    const other = Object.assign(new Error('no table'), { code: 'P2021' })

    await expect(withDatabaseErrors(logger, () => Promise.reject(other))).rejects.toBe(other)
    expect(records()).toEqual([])
  })
})
