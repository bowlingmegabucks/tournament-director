import { useMe } from './useMe'
import type { KnownPermission } from './types'

/** True only when the user is signed in and holds the permission. False while loading or on error. */
export function useCan(permission: KnownPermission): boolean {
  const { data } = useMe()
  return data?.user?.permissions.includes(permission) ?? false
}
