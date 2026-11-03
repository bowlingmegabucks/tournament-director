import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Page } from '../../shared/Page'
import { Toast } from '../../shared/Toast'
import { useMe } from '../auth/useMe'
import { useChangePassword, useUpdateName } from './useAccount'
import styles from './AccountPage.module.css'

/** The API's rule (`minPasswordLength`, `maxPasswordLength`). It still checks; this saves a trip. */
const MIN_LENGTH = 12
const MAX_LENGTH = 128
const NAME_MAX_LENGTH = 100
const TOAST_MS = 8000

interface Notice {
  kind: 'success' | 'error'
  text: string
}

/**
 * Where a signed-in user edits their own name and changes their own password. `App.tsx` wraps it
 * in `RequirePermission` with no permission: any signed-in user may open it.
 */
export function AccountPage() {
  const [notice, setNotice] = useState<Notice>()
  return (
    <Page>
      <title>My account · Tournament Director</title>
      <h1>My account</h1>
      <div className={styles.sections}>
        <ProfileSection onNotice={setNotice} />
        <PasswordSection onNotice={setNotice} />
      </div>
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

function ProfileSection({ onNotice }: Readonly<{ onNotice: (notice: Notice) => void }>) {
  const { data } = useMe()
  const save = useUpdateName()
  const current = data?.user?.name ?? ''
  // `undefined` until the user types, so the field shows the saved name and follows a refetch.
  const [draft, setDraft] = useState<string>()
  const name = draft ?? current

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    save.mutate(name.trim(), {
      onSuccess: (saved) => {
        setDraft(undefined)
        onNotice({ kind: 'success', text: `Name saved as ${saved}.` })
      },
      onError: (error) => {
        onNotice({ kind: 'error', text: error.message })
      },
    })
  }

  return (
    <section className={styles.section} aria-labelledby="account-profile">
      <h2 id="account-profile">Profile</h2>
      <p className={styles.note}>Your email is {data?.user?.email}. An admin changes it.</p>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="account-name">Name</label>
          <input
            id="account-name"
            name="name"
            autoComplete="name"
            required
            maxLength={NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => {
              setDraft(event.target.value)
            }}
          />
        </div>
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save name'}
        </button>
      </form>
    </section>
  )
}

function PasswordSection({ onNotice }: Readonly<{ onNotice: (notice: Notice) => void }>) {
  const change = useChangePassword()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState(false)

  const error = mismatch ? 'The two new passwords do not match.' : change.error?.message

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword !== confirm) {
      setMismatch(true)
      return
    }
    setMismatch(false)
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('')
          setNewPassword('')
          setConfirm('')
          onNotice({
            kind: 'success',
            text: 'Password changed. Your other sessions are signed out.',
          })
        },
      },
    )
  }

  return (
    <section className={styles.section} aria-labelledby="account-password">
      <h2 id="account-password">Change password</h2>
      <form className={styles.form} onSubmit={submit}>
        <p className={styles.note}>
          Use {MIN_LENGTH} or more characters. Changing it signs you out everywhere else.
        </p>
        {error && (
          <p id="account-password-error" role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <PasswordField
          id="account-current"
          label="Current password"
          autoComplete="current-password"
          value={currentPassword}
          describedBy={error ? 'account-password-error' : undefined}
          onChange={setCurrentPassword}
        />
        <PasswordField
          id="account-new"
          label="New password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          value={newPassword}
          describedBy={error ? 'account-password-error' : undefined}
          onChange={(value) => {
            setNewPassword(value)
            setMismatch(false)
          }}
        />
        <PasswordField
          id="account-confirm"
          label="Confirm new password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          value={confirm}
          describedBy={error ? 'account-password-error' : undefined}
          onChange={(value) => {
            setConfirm(value)
            setMismatch(false)
          }}
        />
        <button type="submit" disabled={change.isPending}>
          {change.isPending ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </section>
  )
}

interface PasswordFieldProps {
  id: string
  label: string
  autoComplete: 'current-password' | 'new-password'
  value: string
  minLength?: number
  describedBy: string | undefined
  onChange: (value: string) => void
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  minLength,
  describedBy,
  onChange,
}: Readonly<PasswordFieldProps>) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        required
        minLength={minLength}
        maxLength={MAX_LENGTH}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </div>
  )
}
