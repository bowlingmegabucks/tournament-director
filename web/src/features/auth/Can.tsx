import type { ReactNode } from 'react'
import type { KnownPermission } from './types'
import { useCan } from './useCan'

interface CanProps {
  permission: KnownPermission
  children: ReactNode
}

/**
 * Shows its children only to a user who holds the permission. Hidden, not disabled (D-102).
 * It renders nothing while we check. The API still enforces access (D-19).
 */
export function Can({ permission, children }: Readonly<CanProps>) {
  return useCan(permission) ? children : null
}
