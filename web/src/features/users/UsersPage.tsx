import { useState } from 'react'
import { Link } from 'react-router'
import { Loading } from '../../shared/Loading'
import { Page } from '../../shared/Page'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { roleLabel } from './roleLabels'
import type { ListedUser } from './types'
import { DisableUserDialog } from './DisableUserDialog'
import { EditRolesDialog } from './EditRolesDialog'
import { useSendPasswordReset, useSetUserDisabled, useUpdateUserRoles, useUsers } from './useUsers'
import styles from './UsersPage.module.css'

const TOAST_MS = 8000

interface Notice {
  kind: 'success' | 'error'
  text: string
}

/**
 * The admin-only list of users (`users.manage`, D-101). Each row can send the user a link to
 * choose a new password: the admin never sees or sets one. It can also disable or enable a user
 * and change their roles; the API refuses a change that would leave no enabled admin. `App.tsx` wraps this page in
 * `RequirePermission`.
 */
export function UsersPage() {
  const { data, isPending, error, refetch } = useUsers()
  const send = useSendPasswordReset()
  const setDisabled = useSetUserDisabled()
  const updateRoles = useUpdateUserRoles()
  const [notice, setNotice] = useState<Notice>()
  const [editing, setEditing] = useState<ListedUser>()
  const [disabling, setDisabling] = useState<ListedUser>()

  function sendLink(user: ListedUser) {
    setNotice(undefined)
    send.mutate(user.id, {
      onSuccess: () => {
        setNotice({ kind: 'success', text: `Reset link sent to ${user.email}.` })
      },
      onError: (failure) => {
        setNotice({ kind: 'error', text: failure.message })
      },
    })
  }

  function changeDisabled(user: ListedUser, disabled: boolean) {
    setNotice(undefined)
    setDisabled.mutate(
      { userId: user.id, disabled },
      {
        onSuccess: () => {
          setNotice({
            kind: 'success',
            text: `${user.name} is ${disabled ? 'disabled' : 'enabled'}.`,
          })
        },
        onError: (failure) => {
          setNotice({ kind: 'error', text: failure.message })
        },
      },
    )
  }

  function saveRoles(user: ListedUser, roles: string[]) {
    setNotice(undefined)
    updateRoles.mutate(
      { userId: user.id, roles },
      {
        onSuccess: () => {
          setEditing(undefined)
          setNotice({ kind: 'success', text: `Roles saved for ${user.name}.` })
        },
      },
    )
  }

  const busy = send.isPending || setDisabled.isPending
  const sending = (id: string) => send.isPending && send.variables === id

  return (
    <Page>
      <title>Users · Tournament Director</title>
      <h1>Users</h1>
      <p>
        <Link to="/users/new">Add user</Link>
      </p>
      {isPending && <Loading label="Loading users…" rows={4} />}
      {error && (
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )}
      {data?.length === 0 && <p>No users yet.</p>}
      {data && data.length > 0 && (
        <table className={styles.table}>
          <caption className={styles.hidden}>Users</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Roles</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((user) => (
              <tr key={user.id}>
                <th scope="row">
                  {user.name}
                  {user.disabled && <span className={styles.disabled}> (disabled)</span>}
                </th>
                <td data-label="Email">{user.email}</td>
                <td data-label="Roles">
                  {user.roles.length > 0
                    ? user.roles.map((role) => roleLabel(role).label).join(', ')
                    : 'None'}
                </td>
                <td>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Edit roles for ${user.name}`}
                      onClick={() => {
                        updateRoles.reset()
                        setEditing(user)
                      }}
                    >
                      Edit roles
                    </button>
                    {user.disabled ? (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Enable ${user.name}`}
                        onClick={() => {
                          changeDisabled(user, false)
                        }}
                      >
                        Enable
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Disable ${user.name}`}
                        onClick={() => {
                          setDisabling(user)
                        }}
                      >
                        Disable
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`${sending(user.id) ? 'Sending reset link' : 'Send reset link'} to ${user.name}`}
                      onClick={() => {
                        sendLink(user)
                      }}
                    >
                      {sending(user.id) ? 'Sending reset link…' : 'Send reset link'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <EditRolesDialog
          key={editing.id}
          user={editing}
          saving={updateRoles.isPending}
          error={updateRoles.error?.message}
          onSave={(roles) => {
            saveRoles(editing, roles)
          }}
          onClose={() => {
            setEditing(undefined)
          }}
        />
      )}
      {disabling && (
        <DisableUserDialog
          user={disabling}
          onConfirm={() => {
            changeDisabled(disabling, true)
          }}
          onClose={() => {
            setDisabling(undefined)
          }}
        />
      )}
      {notice && (
        <Toast
          kind={notice.kind}
          autoDismissMs={notice.kind === 'success' ? TOAST_MS : undefined}
          onDismiss={() => {
            setNotice(undefined)
          }}
        >
          {notice.text}
        </Toast>
      )}
    </Page>
  )
}
