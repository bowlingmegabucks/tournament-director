import { describe, expect, it } from 'vitest'
import { createRegistration } from '../../test/factories.ts'
import { registrationListSchema } from './types.ts'

const summary = { registrations: 0, superSweepers: 0, divisions: [], squads: [], sweepers: [] }

describe('registrationListSchema', () => {
  it('wraps the registrations and the summary as the route does (REG-26)', () => {
    const { squadIds, sweeperIds, ...registration } = createRegistration()

    const result = registrationListSchema.safeParse({
      registrations: [{ ...registration, squads: squadIds.length, sweepers: sweeperIds.length }],
      summary,
    })

    expect(result.success).toBe(true)
  })

  it.each([
    ['nothing', {}],
    ['no summary', { registrations: [] }],
    ['no registrations', { summary }],
  ])('rejects %s', (_label, body) => {
    expect(registrationListSchema.safeParse(body).success).toBe(false)
  })
})
