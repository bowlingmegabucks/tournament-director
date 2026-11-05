import { describe, expect, it } from 'vitest'
import { withRetry } from './serializableRetry.ts'

const conflict = () => Object.assign(new Error('write conflict'), { code: 'P2034' })

describe('withRetry', () => {
  it('returns what the first try returns, without a second try', async () => {
    let calls = 0
    const result = await withRetry(() => {
      calls += 1
      return Promise.resolve('done')
    })

    expect(result).toBe('done')
    expect(calls).toBe(1)
  })

  it('tries again after a write conflict and returns the second answer', async () => {
    let calls = 0
    const result = await withRetry(() => {
      calls += 1
      return calls === 1 ? Promise.reject(conflict()) : Promise.resolve('second')
    })

    expect(result).toBe('second')
    expect(calls).toBe(2)
  })

  it('gives up after three tries and throws the conflict', async () => {
    let calls = 0
    const failure = await withRetry(() => {
      calls += 1
      return Promise.reject(conflict())
    }).catch((error: unknown) => error)

    expect(calls).toBe(3)
    expect(failure).toMatchObject({ code: 'P2034' })
  })

  it('runs the tries one after another, never together', async () => {
    let running = 0
    let most = 0
    let calls = 0
    await withRetry(async () => {
      running += 1
      most = Math.max(most, running)
      await Promise.resolve()
      running -= 1
      calls += 1
      if (calls < 3) throw conflict()
    })

    expect(most).toBe(1)
    expect(calls).toBe(3)
  })

  it.each([
    ['another Prisma code', Object.assign(new Error('x'), { code: 'P2002' })],
    ['an error with no code', new Error('x')],
    ['a value that is not an object', 'P2034'],
    ['null', null],
  ])('does not retry %s', async (_label, error) => {
    let calls = 0
    const failure = await withRetry(() => {
      calls += 1
      return Promise.reject(error)
    }).catch((caught: unknown) => caught)

    expect(calls).toBe(1)
    expect(failure).toBe(error)
  })
})
