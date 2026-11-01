import { permissions, type Permission } from './permissions.ts'

/**
 * The roles a user can hold (D-97). Better Auth stores the names on the user; the permissions each
 * one carries live here, in one table (D-96). A route asks for a permission, never a role.
 */
export const roleNames = ['scoreKeeper', 'director', 'admin'] as const

export type RoleName = (typeof roleNames)[number]

const knownRoles: ReadonlySet<string> = new Set(roleNames)

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === 'string' && knownRoles.has(value)
}

// Director holds everything except these two (D-97), so a permission added later reaches the
// director without an edit here. When you add a permission only an admin should hold, list it here.
const withheldFromDirector: readonly Permission[] = ['users.manage', 'bowlers.ssn']

const rolePermissions: Record<RoleName, readonly Permission[]> = {
  // What collecting scores needs: enter them, and see who is bowling and where (D-97).
  scoreKeeper: ['scores.write', 'registrations.read', 'lanes.read'],
  director: permissions.filter((permission) => !withheldFromDirector.includes(permission)),
  // Every permission, by rule and not by list, so a new one reaches the admin at once.
  admin: permissions,
}

/**
 * The roles in a stored `role` value. A user may hold several; Better Auth keeps them as
 * `director,scoreKeeper`. A name that is not a role (including the `none` a user gets when made
 * with no role) is dropped, so it grants nothing. Names are case-sensitive.
 */
export function rolesOf(stored: string | null | undefined): RoleName[] {
  const names = (stored ?? '').split(',').map((name) => name.trim())
  return [...new Set(names)].filter(isRoleName)
}

/**
 * Every permission a stored `role` value grants: the union of its roles. A user with no known
 * role holds none. In the order of the `permissions` list.
 */
export function permissionsOf(stored: string | null | undefined): Permission[] {
  const held = new Set(rolesOf(stored).flatMap((role) => rolePermissions[role]))
  return permissions.filter((permission) => held.has(permission))
}
