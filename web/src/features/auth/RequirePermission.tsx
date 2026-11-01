import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Loading } from '../../shared/Loading'
import { Page } from '../../shared/Page'
import { QueryError } from '../../shared/QueryError'
import { signInEnabled } from './signInEnabled'
import type { KnownPermission } from './types'
import { useMe } from './useMe'

interface RequirePermissionProps {
  permission: KnownPermission
  children: ReactNode
}

/**
 * Wraps a page that needs a permission (D-102). Signed out goes to `/login` and comes back after
 * sign-in. Signed in without the permission sees a message. A failed check shows an error with a
 * retry, never the signed-out view.
 */
export function RequirePermission({ permission, children }: Readonly<RequirePermissionProps>) {
  const { data, isPending, error, refetch } = useMe()
  const location = useLocation()

  if (isPending) {
    return (
      <Page>
        <Loading label="Checking sign-in…" />
      </Page>
    )
  }
  if (error) {
    return (
      <Page>
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      </Page>
    )
  }
  if (data.user === null && !signInEnabled()) {
    return (
      <Page>
        <title>Sign in needed · Tournament Director</title>
        <h1>Sign in needed</h1>
        <p>This page needs a signed-in user, and sign-in is not open yet.</p>
      </Page>
    )
  }
  if (data.user === null) return <Navigate to="/login" state={{ from: location }} replace />
  if (!data.user.permissions.includes(permission)) {
    return (
      <Page>
        <title>No access · Tournament Director</title>
        <h1>No access</h1>
        <p>You do not have permission to view this page.</p>
      </Page>
    )
  }
  return children
}
