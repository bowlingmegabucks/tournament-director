import { describe, expect, it } from 'vitest'
import { notFoundProblem, other, toProblem, validation } from './problem.ts'

describe('toProblem (API-12)', () => {
  it('is a 400 when any reason is a validation error, even beside others', () => {
    const problem = toProblem([other('A', 'a'), validation('B', 'b')], 'detail', 'trace')

    expect(problem.status).toBe(400)
  })

  it('is a 500 when no reason is a validation error', () => {
    expect(toProblem([other('A', 'a')], 'detail', 'trace').status).toBe(500)
  })

  it('lists each reason by code and description, and joins the descriptions in message', () => {
    const problem = toProblem([validation('A', 'one.'), validation('B', 'two.')], 'detail', 'trace')

    expect(problem).toEqual({
      status: 400,
      detail: 'detail',
      errors: [
        { code: 'A', description: 'one.' },
        { code: 'B', description: 'two.' },
      ],
      traceId: 'trace',
      message: 'one. two.',
    })
  })
})

describe('notFoundProblem', () => {
  it('is the legacy 404 body', () => {
    expect(notFoundProblem('trace')).toEqual({
      status: 404,
      detail: 'Resource not found',
      traceId: 'trace',
      message: 'Registration not found',
    })
  })
})
