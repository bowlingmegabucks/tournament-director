import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Loading } from '../../shared/Loading'
import { Page } from '../../shared/Page'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { RolePicker } from './RolePicker'
import { useCreateUser, useUserOptions } from './useUsers'
import styles from './NewUserPage.module.css'

const TOAST_MS = 8000

/**
 * The admin-only page that adds a user (`users.manage`, D-101). The admin enters a name, an email,
 * and one or more roles (D-103); the API emails the new user a link to choose a password, so the
 * admin never sees one. `App.tsx` wraps this page in `RequirePermission`.
 */
export function NewUserPage() {
  const options = useUserOptions()
  const create = useCreateUser()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [rolesMissing, setRolesMissing] = useState(false)
  const [invited, setInvited] = useState<string>()

  function toggle(role: string, checked: boolean) {
    setRoles((current) => (checked ? [...current, role] : current.filter((r) => r !== role)))
    setRolesMissing(false)
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (roles.length === 0) {
      setRolesMissing(true)
      return
    }
    create.mutate(
      { name: name.trim(), email: email.trim(), roles },
      {
        onSuccess: (user) => {
          setInvited(user.email)
          setName('')
          setEmail('')
          setRoles([])
        },
      },
    )
  }

  return (
    <Page>
      <title>Add user · Tournament Director</title>
      <h1>Add user</h1>
      {options.isPending && <Loading label="Loading…" />}
      {options.error && (
        <QueryError
          error={options.error}
          onRetry={() => {
            void options.refetch()
          }}
        />
      )}
      {options.data && !options.data.inviteEmail && (
        <p role="alert" className={styles.error}>
          Email is not set up on the server, so no one can be added yet. An admin sets the
          SMTP_HOST, SMTP_USER, SMTP_PASSWORD, MAIL_FROM, and WEB_BASE_URL settings on the API.
        </p>
      )}
      {options.data && (
        <form className={styles.form} onSubmit={submit}>
          <p className={styles.note}>
            The new user gets an email with a link to choose a password. You never see it.
          </p>
          {create.error && (
            <p id="new-user-error" role="alert" className={styles.error}>
              {create.error.message}
            </p>
          )}
          <div className={styles.field}>
            <label htmlFor="new-user-name">Name</label>
            <input
              id="new-user-name"
              name="name"
              type="text"
              autoComplete="off"
              required
              maxLength={100}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="new-user-email">Email</label>
            <input
              id="new-user-email"
              name="email"
              type="email"
              autoComplete="off"
              required
              maxLength={254}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
              }}
            />
          </div>
          <RolePicker
            idPrefix="new-user"
            roles={options.data.roles}
            selected={roles}
            onToggle={toggle}
            error={rolesMissing ? 'Pick at least one role.' : undefined}
          />
          <button type="submit" disabled={create.isPending || !options.data.inviteEmail}>
            {create.isPending ? 'Adding…' : 'Add user'}
          </button>
        </form>
      )}
      {invited && (
        <Toast
          kind="success"
          autoDismissMs={TOAST_MS}
          onDismiss={() => {
            setInvited(undefined)
          }}
        >
          Invite sent to {invited}.
        </Toast>
      )}
    </Page>
  )
}
