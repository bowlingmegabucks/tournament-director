import { describe, expect, it } from 'vitest'
import { forcedAdvancerSchemaSql } from './forcedAdvancerSchema.ts'

describe('forcedAdvancerSchemaSql', () => {
  it('adds the column only if it is missing, so the script can run twice (NSH-20)', () => {
    const statements = forcedAdvancerSchemaSql()
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(
      /^ALTER TABLE `SquadRegistration`\s+ADD COLUMN IF NOT EXISTS `ForcedAdvancer`/,
    )
  })

  it('leaves every stored entry unflagged', () => {
    expect(forcedAdvancerSchemaSql()[0]).toContain('NOT NULL DEFAULT 0')
  })
})
