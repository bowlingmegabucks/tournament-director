import { describe, expect, it } from 'vitest'
import { authSchemaSql } from './authSchema.ts'

describe('authSchemaSql', () => {
  it('reads one create statement per Better Auth table, parents first', () => {
    const names = authSchemaSql().map(
      (statement) => /CREATE TABLE IF NOT EXISTS `(\w+)`/.exec(statement)?.[1],
    )

    expect(names).toEqual(['user', 'session', 'account', 'verification'])
  })

  it('drops comments and the semicolons between statements', () => {
    for (const statement of authSchemaSql()) {
      expect(statement).not.toContain('--')
      expect(statement).not.toContain(';')
    }
  })
})
