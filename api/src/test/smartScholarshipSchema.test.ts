import { describe, expect, it } from 'vitest'
import { smartScholarshipSchemaSql } from './smartScholarshipSchema.ts'

describe('smartScholarshipSchemaSql', () => {
  it('adds the column only if it is missing, so the script can run twice (SMT-08)', () => {
    const statements = smartScholarshipSchemaSql()
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(
      /^ALTER TABLE `Registrations`\s+ADD COLUMN IF NOT EXISTS `SmartScholarship`/,
    )
  })

  it('leaves every stored registration paid in cash', () => {
    expect(smartScholarshipSchemaSql()[0]).toContain('NOT NULL DEFAULT 0')
  })
})
