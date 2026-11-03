import { describe, expect, it } from 'vitest'
import { createUserSchema, updateUserSchema } from './types.ts'

const valid = { email: 'bea@example.com', name: 'Bea', roles: ['director'] }

describe('createUserSchema', () => {
  it('trims and lowercases the email, and trims the name', () => {
    const parsed = createUserSchema.parse({ ...valid, email: '  Bea@Example.COM ', name: ' Bea ' })

    expect(parsed).toMatchObject({ email: 'bea@example.com', name: 'Bea' })
  })

  it('refuses an email over 254 characters', () => {
    const email = `a@${`${'b'.repeat(60)}.`.repeat(5)}com`

    expect(email.length).toBeGreaterThan(254)
    expect(createUserSchema.safeParse({ ...valid, email }).success).toBe(false)
  })

  it('keeps each role once', () => {
    const parsed = createUserSchema.parse({ ...valid, roles: ['director', 'director', 'admin'] })

    expect(parsed.roles).toEqual(['director', 'admin'])
  })
})

describe('updateUserSchema', () => {
  it('needs at least one known role', () => {
    expect(updateUserSchema.safeParse({ roles: [] }).success).toBe(false)
    expect(updateUserSchema.safeParse({ roles: ['owner'] }).success).toBe(false)
    expect(updateUserSchema.safeParse({ roles: ['admin'] }).success).toBe(true)
  })
})
