/**
 * Every permission a route can ask for (D-96). Names are `area.action`, kept coarse: add one only
 * when two roles must differ. The roles that bundle them (D-97) arrive with sign-in (stage 2).
 */
export const permissions = [
  'registrations.read',
  'registrations.write',
  'lanes.read',
  'lanes.assign',
  'scores.write',
  'sessions.complete',
  'tournaments.write',
  'bowlers.ssn',
  'users.manage',
] as const

export type Permission = (typeof permissions)[number]

const known: ReadonlySet<string> = new Set(permissions)

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && known.has(value)
}
