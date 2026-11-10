import { describe, expect, it } from 'vitest'
import { scoreSchemaSql } from './scoreSchema.ts'

describe('scoreSchemaSql', () => {
  it('creates the skip table only if it is missing, so the script can run twice (D-235)', () => {
    const statements = scoreSchemaSql()
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/^CREATE TABLE IF NOT EXISTS `SessionSkip`/)
  })

  it('holds no comment text in a statement', () => {
    for (const statement of scoreSchemaSql()) expect(statement).not.toContain('--')
  })
})
