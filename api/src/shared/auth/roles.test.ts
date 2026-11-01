import { describe, expect, it } from 'vitest'
import { permissions } from './permissions.ts'
import { isRoleName, permissionsOf, rolesOf, roleNames } from './roles.ts'

describe('roles (D-97)', () => {
  it('has the three day-one roles', () => {
    expect(roleNames).toEqual(['scoreKeeper', 'director', 'admin'])
  })

  it('lets a score keeper enter scores and see who is bowling and where', () => {
    expect(permissionsOf('scoreKeeper')).toEqual(
      permissions.filter((p) => ['registrations.read', 'lanes.read', 'scores.write'].includes(p)),
    )
    expect(permissionsOf('scoreKeeper')).toHaveLength(3)
  })

  it('keeps a score keeper away from everything else', () => {
    const held = permissionsOf('scoreKeeper')

    for (const denied of [
      'registrations.write',
      'lanes.assign',
      'sessions.complete',
      'tournaments.write',
      'bowlers.ssn',
      'users.manage',
    ] as const) {
      expect(held).not.toContain(denied)
    }
  })

  it('gives a director everything except user management and SSN checks', () => {
    const held = permissionsOf('director')

    expect(held).toEqual(permissions.filter((p) => p !== 'users.manage' && p !== 'bowlers.ssn'))
    expect(held).toContain('tournaments.write')
    expect(held).toContain('scores.write')
    expect(held).not.toContain('users.manage')
    expect(held).not.toContain('bowlers.ssn')
  })

  it('gives an admin every permission', () => {
    expect(permissionsOf('admin')).toEqual([...permissions])
  })

  it('lets no one but the admin manage users or check SSNs', () => {
    for (const role of ['scoreKeeper', 'director']) {
      expect(permissionsOf(role)).not.toContain('users.manage')
      expect(permissionsOf(role)).not.toContain('bowlers.ssn')
    }
  })

  it.each([null, undefined, '', ' ', 'none', 'user', 'Admin', 'ADMIN', 'superadmin', 'direcotr'])(
    'grants nothing for the stored role %j',
    (stored) => {
      expect(permissionsOf(stored)).toEqual([])
      expect(rolesOf(stored)).toEqual([])
    },
  )

  describe('a user with several roles', () => {
    it('holds the union of what each grants', () => {
      expect(permissionsOf('scoreKeeper,director')).toEqual(permissionsOf('director'))
      expect(permissionsOf('scoreKeeper,admin')).toEqual([...permissions])
    })

    it('reads Better Auth’s comma list, with or without spaces', () => {
      expect(rolesOf('director,scoreKeeper')).toEqual(['director', 'scoreKeeper'])
      expect(rolesOf(' director , scoreKeeper ')).toEqual(['director', 'scoreKeeper'])
    })

    it('ignores a name that is not a role and keeps the rest', () => {
      expect(rolesOf('none,director,typo')).toEqual(['director'])
      expect(permissionsOf('none,scoreKeeper')).toEqual(permissionsOf('scoreKeeper'))
    })

    it('lists a repeated role once', () => {
      expect(rolesOf('admin,admin,director,admin')).toEqual(['admin', 'director'])
    })

    it('lists permissions in the order of the permission list, with none twice', () => {
      const held = permissionsOf('director,scoreKeeper,director')

      expect(held).toEqual(permissions.filter((p) => held.includes(p)))
      expect(new Set(held).size).toBe(held.length)
    })
  })

  it('has at least one role that holds each permission, so none is unreachable', () => {
    for (const permission of permissions) {
      expect(roleNames.some((role) => permissionsOf(role).includes(permission))).toBe(true)
    }
  })

  it('knows a role name only when it is exactly one of the three', () => {
    expect(roleNames.every(isRoleName)).toBe(true)
    expect(['none', 'Admin', '', 'admin,director', 7, null].some(isRoleName)).toBe(false)
  })
})
