import { describe, expect, it } from 'vitest'
import { payoutSchemaSql } from './payoutSchema.ts'

describe('payoutSchemaSql', () => {
  it('creates the table only if it is missing, so the script can run twice (PAY-17, D-281)', () => {
    const statements = payoutSchemaSql()
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/^CREATE TABLE IF NOT EXISTS `Payouts`/)
  })

  it('makes a payee unique in one event (PAY-01, D-267)', () => {
    expect(payoutSchemaSql()[0]).toMatch(
      /UNIQUE KEY `UX_Payouts_Event_Registration` \(`Source`, `EventId`, `RegistrationId`\)/,
    )
  })

  it('holds no comment text in a statement', () => {
    for (const statement of payoutSchemaSql()) expect(statement).not.toContain('--')
  })
})
