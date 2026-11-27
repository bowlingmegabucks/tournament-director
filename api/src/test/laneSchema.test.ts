import { describe, expect, it } from 'vitest'
import { laneSchemaSql } from './laneSchema.ts'

describe('laneSchemaSql', () => {
  it('holds one statement that creates the table only when it is missing', () => {
    const statements = laneSchemaSql()

    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/^CREATE TABLE IF NOT EXISTS `LanesOutOfPlay`/)
    expect(statements[0]).toMatch(/PRIMARY KEY \(`SquadId`, `Lane`\)/)
    expect(statements[0]).not.toContain('--')
  })
})
