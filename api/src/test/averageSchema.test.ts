import { describe, expect, it } from 'vitest'
import { averageSchemaSql } from './averageSchema.ts'

describe('averageSchemaSql', () => {
  it('creates the table only if it is missing, so the script can run twice (AVG-01, D-287)', () => {
    const statements = averageSchemaSql()
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/^CREATE TABLE IF NOT EXISTS `AverageVerifications`/)
  })

  it('holds one row for each registration (AVG-01, D-287)', () => {
    expect(averageSchemaSql()[0]).toMatch(/PRIMARY KEY \(`RegistrationId`\)/)
  })

  it('holds no comment text in a statement', () => {
    for (const statement of averageSchemaSql()) expect(statement).not.toContain('--')
  })
})
